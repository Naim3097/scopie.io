import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { verifyHs256Jwt } from "../util/jwt";

export interface AuthedUser {
  /** Supabase auth uid (uuid) for real users; `guest:<id>` in demo mode. */
  id: string;
  email: string | null;
  phone: string | null;
  isGuest: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Identity comes from the TOKEN, never from request bodies or params — the
 * audit's enumeration findings (wallet/:userId, cart?buyerId=) die here.
 *
 * Configured mode (SUPABASE_JWT_SECRET set): Supabase access tokens are
 * HS256-signed with the project JWT secret and verified locally — no network
 * call per request. Demo mode (secret unset): a stable guest identity is
 * derived from the client's anonymous id header.
 */
@Injectable()
export class AuthService {
  constructor() {
    // Fail closed: a production deploy with no auth secret and no explicit
    // demo opt-in is almost always a misconfiguration (a cleared/truncated
    // env var), and silently serving guest identities on money endpoints
    // would be a blanket auth bypass. Refuse to boot instead.
    const demoOptIn = process.env.SCOPIE_DEMO_MODE === "1";
    const secret = process.env.SUPABASE_JWT_SECRET ?? "";
    if (process.env.NODE_ENV === "production" && !demoOptIn && secret.length < 16) {
      throw new Error(
        "SUPABASE_JWT_SECRET is required in production (set SCOPIE_DEMO_MODE=1 to run demo mode intentionally)",
      );
    }
  }

  get configured(): boolean {
    // A too-short secret is treated as unset so a truncated value can't slip
    // through as "configured".
    return (process.env.SUPABASE_JWT_SECRET ?? "").length >= 16;
  }

  /** Strict: a valid, unexpired, authenticated Supabase token — or null. */
  fromRequest(req: Request): AuthedUser | null {
    if (!this.configured) return null;
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const claims = verifyHs256Jwt(header.slice(7), process.env.SUPABASE_JWT_SECRET!);
    if (!claims) return null;
    const exp = Number(claims["exp"] ?? 0);
    if (!exp || exp * 1000 < Date.now()) return null;
    const aud = claims["aud"];
    const audOk = aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated"));
    if (!audOk) return null;
    const sub = String(claims["sub"] ?? "");
    if (!UUID_RE.test(sub)) return null;
    return {
      id: sub.toLowerCase(),
      email: typeof claims["email"] === "string" ? (claims["email"] as string) : null,
      phone: typeof claims["phone"] === "string" && claims["phone"] ? (claims["phone"] as string) : null,
      isGuest: false,
    };
  }

  /**
   * Demo-mode identity: stable per client via the x-scopie-guest header (the
   * web app always sends one). A missing/invalid header gets a fresh RANDOM
   * id per request rather than a shared `guest:anonymous` scope — two
   * header-less devices must never share cart/order ownership. The tradeoff:
   * a header-less caller can't retrieve its own cart/order later, which is
   * the safe default.
   */
  guestFrom(req: Request): AuthedUser {
    const raw = req.headers["x-scopie-guest"];
    const candidate = typeof raw === "string" ? raw : "";
    const id = GUEST_ID_RE.test(candidate) ? candidate : `ephemeral-${randomUUID()}`;
    return { id: `guest:${id}`, email: null, phone: null, isGuest: true };
  }
}
