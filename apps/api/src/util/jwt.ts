import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 JWT verification (no deps). Used for Supabase access tokens
 * (signed with the project's JWT secret) and the payment gateway's webhook
 * JWTs. Rejects any token whose header does not declare HS256 — algorithm
 * confusion must fail closed.
 */
export function verifyHs256Jwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string };
    if (h.alg !== "HS256") return null;
    const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
