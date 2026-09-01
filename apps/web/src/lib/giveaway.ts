import type { Product } from "@scopie/core";
import { demoProducts } from "./catalog";

/**
 * The giveaway engine (Rehearsal tier). Whatnot's in-stream giveaway,
 * deterministically simulated: free one-tap entry, entries climb on a seeded
 * curve, the draw happens on the shared clock, and the winner is a pure
 * function of the cycle seed — with the user's own entry folded in locally.
 */

export interface GiveawayConfig {
  roomId: string;
  productId: string;
  /** Card framing ("Free entry · winner announced live"). */
  note: string;
}

export const GIVEAWAYS: Record<string, GiveawayConfig> = {
  // Mael Burger Duo Box — Smash Night's crowd-puller.
  room_mael: { roomId: "room_mael", productId: "mael-duo-box", note: "Free entry · drawn live" },
};

/** Cycle: idle 3m → open 4m → drawing 30s → announced (rest). */
export const CYCLE_MS = 10 * 60_000;
const IDLE_MS = 3 * 60_000;
const OPEN_MS = 4 * 60_000;
const DRAW_MS = 30_000;

export type GiveawayPhase = "idle" | "open" | "drawing" | "done";

function seed01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const NAMES = ["Nurul", "Aiman", "Farah", "Hafiz", "Mei Ling", "Syafiq", "Aisyah", "Daniel", "Zara", "Iqbal", "Priya", "Adam"];

const LS_ENTRIES = "scopie_giveaway_entries";

export function hasEntered(cycleId: string): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(LS_ENTRIES) ?? "[]") as unknown;
    return Array.isArray(all) && all.includes(cycleId);
  } catch {
    return false;
  }
}

export function enterGiveaway(cycleId: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(LS_ENTRIES) ?? "[]") as unknown;
    const list = Array.isArray(all) ? (all as string[]) : [];
    if (!list.includes(cycleId)) localStorage.setItem(LS_ENTRIES, JSON.stringify([cycleId, ...list].slice(0, 30)));
  } catch {
    /* private mode — the session state in the component still holds */
  }
}

export interface GiveawayState {
  config: GiveawayConfig;
  product: Product;
  phase: GiveawayPhase;
  cycleId: string;
  opensAt: number;
  closesAt: number;
  announceAt: number;
  /** Simulated entry count (user's entry folded in). */
  entries: number;
  userEntered: boolean;
  /** Winner display name once announced; "you" when the user wins. */
  winner: string | null;
  youWon: boolean;
}

export function giveawayState(roomId: string, now: number, userEntered?: boolean): GiveawayState | null {
  const config = GIVEAWAYS[roomId];
  if (!config) return null;
  const product = demoProducts.find((p) => p.id === config.productId);
  if (!product) return null;

  const cycleIndex = Math.floor(now / CYCLE_MS);
  const cycleStart = cycleIndex * CYCLE_MS;
  const cycleId = `${roomId}:${cycleIndex}`;
  const opensAt = cycleStart + IDLE_MS;
  const closesAt = opensAt + OPEN_MS;
  const announceAt = closesAt + DRAW_MS;

  let phase: GiveawayPhase;
  if (now < opensAt) phase = "idle";
  else if (now < closesAt) phase = "open";
  else if (now < announceAt) phase = "drawing";
  else phase = "done";

  const entered = userEntered ?? hasEntered(cycleId);

  // Entries climb fast then taper — seeded target 140–420 per cycle.
  // Monotone by construction: each 3s bucket contributes a NON-NEGATIVE
  // seeded slice of the curve, so the count on screen never goes down and
  // freezes seamlessly at closesAt (an entry counter must never count down).
  const target = 140 + Math.round(seed01(`${cycleId}:n`) * 280);
  const elapsed = Math.max(0, Math.min(now, closesAt) - opensAt);
  const curveAt = (t: number) => 1 - Math.pow(1 - t, 1.8);
  const lastBucket = Math.floor(Math.min(elapsed, OPEN_MS - 1) / 3000);
  let acc = 0;
  for (let b = 0; b <= lastBucket; b++) {
    const t0 = (b * 3000) / OPEN_MS;
    const t1 = Math.min(1, ((b + 1) * 3000) / OPEN_MS, elapsed / OPEN_MS);
    if (t1 <= t0) break;
    acc += (curveAt(t1) - curveAt(t0)) * (0.5 + seed01(`${cycleId}:j${b}`));
  }
  const sim = Math.max(0, Math.min(target, Math.round(acc * target)));
  const entries = sim + (entered ? 1 : 0);

  // The draw: user wins ~40% of entered cycles (Rehearsal theater — labeled);
  // otherwise a seeded name from the room.
  const userWins = entered && seed01(`${cycleId}:w`) < 0.4;
  const winner =
    phase === "done" ? (userWins ? "you" : NAMES[Math.floor(seed01(`${cycleId}:win`) * NAMES.length)]!) : null;

  return {
    config,
    product,
    phase,
    cycleId,
    opensAt,
    closesAt,
    announceAt,
    entries,
    userEntered: entered,
    winner,
    youWon: phase === "done" && winner === "you",
  };
}
