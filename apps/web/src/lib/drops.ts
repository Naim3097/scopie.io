import type { Product } from "@scopie/core";
import { demoProducts } from "./catalog";

/**
 * The flash-drop engine (Rehearsal tier). Everything is a pure function of
 * wall-clock time and a per-cycle seed, so the state is identical on every
 * device and IMMUTABLE across refreshes — a countdown can never reset and a
 * price can never linger past its window (the Emma Sleep rule, encoded).
 *
 * Envelope follows TikTok Shop's own flash-sale parameters (pre-countdown
 * 10–300s, window 1–20 min) and Shopee's claimed-bar grammar. Quantity
 * leads, the clock supports (Aggarwal et al., J. Advertising 2011).
 */

export interface DropConfig {
  roomId: string;
  productId: string;
  /** Deal price ONLY where the merchant has a genuine sale pair — otherwise
   *  equal to list price and the drop is limited-units, not discounted. */
  dealPriceSen: number;
  stock: number;
}

/** Cycle: idle 2m → pre-countdown 1m → live window 5m → ended 2m (10m loop). */
const CYCLE_MS = 10 * 60_000;
const IDLE_MS = 2 * 60_000;
const PRE_MS = 60_000;
const WINDOW_MS = 5 * 60_000;

export const DROPS: Record<string, DropConfig> = {
  // Sugarbomb's genuine pair: RM45.90 → RM39.90.
  room_scopie_live: { roomId: "room_scopie_live", productId: "sugarbomb-hush-lush", dealPriceSen: 3990, stock: 120 },
  // HOOR: no sale pairs exist — limited units at list price. Honest scarcity.
  room_hoor: { roomId: "room_hoor", productId: "hoor-senja", dealPriceSen: 19900, stock: 40 },
  // Kalima: limited units at list price.
  room_kalima: { roomId: "room_kalima", productId: "kalima-ruwa-caftan", dealPriceSen: 25000, stock: 30 },
  // Mael: genuine combo value framing — list price, small batch.
  room_mael: { roomId: "room_mael", productId: "mael-duo-box", dealPriceSen: 5290, stock: 60 },
};

export type DropPhase = "idle" | "pre" | "live" | "ended";

export interface DropCycle {
  config: DropConfig;
  product: Product;
  phase: DropPhase;
  cycleId: string;
  /** absolute ms — immutable within a cycle */
  startAt: number;
  endAt: number;
  claimed: number;
  remaining: number;
  soldOut: boolean;
  userClaimed: boolean;
}

/** Deterministic 32-bit hash → [0,1). */
function seed01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const LS_CLAIMS = "scopie_drop_claims";

export interface DropClaim {
  cycleId: string;
  productId: string;
  priceSen: number;
  at: number;
}

export function readClaims(): DropClaim[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CLAIMS) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as DropClaim[]) : [];
  } catch {
    return [];
  }
}

function hasClaimed(cycleId: string): boolean {
  try {
    return readClaims().some((c) => c.cycleId === cycleId);
  } catch {
    return false;
  }
}

/**
 * Simulated units claimed at `elapsed` ms into the window. Monotonic,
 * seeded per cycle, stepped in 4s buckets so the bar moves in visible
 * beats. Some cycles sell out (the drama), most end 72–94% claimed.
 */
function simClaimed(cycleSeed: number, elapsedMs: number, stock: number, userClaimed: boolean): number {
  const cap = stock - (userClaimed ? 1 : 0);
  if (elapsedMs <= 0) return 0;
  const t = Math.min(1, elapsedMs / WINDOW_MS);
  const sellsOut = cycleSeed > 0.62; // ~38% of cycles reach a full sellout
  const target = sellsOut ? 1 : 0.72 + cycleSeed * 0.3; // 0.72–0.94
  // Ease-out curve: fast early rush, long tail — sellouts land ~85% through.
  const shaped = sellsOut ? Math.min(1, t / 0.85) : t;
  const smooth = 1 - Math.pow(1 - shaped, 2.2);
  // 4s buckets with seeded jitter, always monotonic.
  const bucket = Math.floor(elapsedMs / 4000);
  const jitter = (seed01(`${cycleSeed}-${bucket}`) - 0.5) * 0.04;
  const frac = Math.max(0, Math.min(1, smooth * target + jitter * t));
  return Math.min(cap, Math.round(frac * stock));
}

export function dropCycle(roomId: string, now: number): DropCycle | null {
  const config = DROPS[roomId];
  if (!config) return null;
  const product = demoProducts.find((p) => p.id === config.productId);
  if (!product) return null;

  const cycleIndex = Math.floor(now / CYCLE_MS);
  const cycleStart = cycleIndex * CYCLE_MS;
  const inCycle = now - cycleStart;
  const cycleId = `${roomId}:${cycleIndex}`;
  const cycleSeed = seed01(cycleId);

  const startAt = cycleStart + IDLE_MS + PRE_MS;
  const endAt = startAt + WINDOW_MS;

  let phase: DropPhase;
  if (inCycle < IDLE_MS) phase = "idle";
  else if (now < startAt) phase = "pre";
  else if (now < endAt) phase = "live";
  else phase = "ended";

  const userClaimed = hasClaimed(cycleId);
  const claimed =
    phase === "live" || phase === "ended"
      ? simClaimed(cycleSeed, Math.min(now, endAt) - startAt, config.stock, userClaimed) + (userClaimed ? 1 : 0)
      : 0;
  const remaining = Math.max(0, config.stock - claimed);

  return {
    config,
    product,
    phase,
    cycleId,
    startAt,
    endAt,
    claimed,
    remaining,
    soldOut: remaining === 0,
    userClaimed,
  };
}

/** FCFS claim. Returns the claim on success, null when the drop is gone. */
export function claimDrop(cycle: DropCycle, now: number): DropClaim | null {
  if (cycle.phase !== "live" || cycle.soldOut || cycle.userClaimed) return null;
  const claim: DropClaim = {
    cycleId: cycle.cycleId,
    productId: cycle.product.id,
    priceSen: cycle.config.dealPriceSen,
    at: now,
  };
  try {
    localStorage.setItem(LS_CLAIMS, JSON.stringify([claim, ...readClaims()].slice(0, 30)));
  } catch {
    /* private mode — the claim still succeeds for this session */
  }
  return claim;
}

/** Seeded Malaysian buyer names for the claim toasts (Rehearsal actors). */
const NAMES = ["Nurul", "Aiman", "Farah", "Hafiz", "Mei Ling", "Syafiq", "Aisyah", "Daniel", "Zara", "Iqbal", "Priya", "Adam"];
export function toastName(cycleId: string, bucket: number): string {
  return NAMES[Math.floor(seed01(`${cycleId}-t${bucket}`) * NAMES.length)]!;
}

export const dropWindowMs = WINDOW_MS;
