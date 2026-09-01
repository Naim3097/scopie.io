import type { Product } from "@scopie/core";
import { demoProducts } from "./catalog";

/**
 * The auction engine (Rehearsal tier). Like the drop engine, everything is a
 * deterministic REPLAY: simulated rival bids come from a per-cycle seed, the
 * user's own bids are persisted with their timestamps, and the whole auction
 * is recomputed from wall-clock time on every tick — so a refresh mid-auction
 * reconstructs the identical state, and no two devices can disagree about
 * who leads (given the same local actions).
 *
 * Mechanics follow the live-auction canon:
 *  - soft close (Whatnot): a bid in the final seconds resets the clock, so
 *    sniping extends the show instead of ending it; capped, so an auction
 *    always ends.
 *  - proxy bidding (eBay's automatic bidding): the user sets a max; the
 *    engine bids the minimum needed to lead, never their max — a winner
 *    pays rival-top + one increment, and an equal max goes to the earlier
 *    bid (the user's proxy beats a later rival at the same number).
 *  - increment ladder scaled to RM price bands.
 */

export interface AuctionConfig {
  roomId: string;
  productId: string;
  /** Opening ask — the auction starts here, not at list. */
  startPriceSen: number;
  /** Lot framing shown on the card ("One-off colourway" etc). */
  lotNote: string;
}

export const AUCTIONS: Record<string, AuctionConfig> = {
  // HOOR PUSAKA — one-off batik colourway, RM199 list, opens low.
  room_hoor: { roomId: "room_hoor", productId: "hoor-pusaka", startPriceSen: 3900, lotNote: "One-off colourway · list RM 199" },
  // Kalima Ruwa Caftan — RM250 list.
  room_kalima: { roomId: "room_kalima", productId: "kalima-ruwa-caftan", startPriceSen: 8000, lotNote: "Show lot · list RM 250" },
};

/** Cycle: idle 2m → preview 1m → live (90s base, soft-close extendable) → sold. */
export const CYCLE_MS = 10 * 60_000;
const IDLE_MS = 2 * 60_000;
const PREVIEW_MS = 60_000;
const BASE_MS = 90_000;
/** Soft close: a bid with under 10s left resets the clock to 10s… */
const SOFT_MS = 10_000;
/** …but never past this — an auction ALWAYS ends. */
const MAX_EXT_MS = 120_000;

export type AuctionPhase = "idle" | "preview" | "live" | "sold";

/** RM-banded increment ladder (our own rule, stated in the UI). */
export function bidIncrement(priceSen: number): number {
  if (priceSen < 2500) return 100; // RM1
  if (priceSen < 10000) return 500; // RM5
  if (priceSen < 25000) return 1000; // RM10
  return 2500; // RM25
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

const RIVALS = ["Farah", "Aiman", "Mei Ling", "Syafiq", "Nurul", "Daniel", "Priya", "Hafiz"];

export interface BidEvent {
  at: number;
  /** Display name; "you" is the user. */
  name: string;
  amountSen: number;
  isYou: boolean;
}

/** One user action: raising their proxy max at a moment in time. */
export interface UserBid {
  at: number;
  maxSen: number;
}

const LS_BIDS = "scopie_auction_bids";
const LS_PREBIDS = "scopie_prebids";

export function readUserBids(cycleId: string): UserBid[] {
  try {
    const all = JSON.parse(localStorage.getItem(LS_BIDS) ?? "{}") as Record<string, UserBid[]>;
    const mine = all[cycleId];
    return Array.isArray(mine) ? mine.filter((b) => Number.isFinite(b.at) && Number.isFinite(b.maxSen)) : [];
  } catch {
    return [];
  }
}

export function writeUserBid(cycleId: string, bid: UserBid): void {
  try {
    const all = JSON.parse(localStorage.getItem(LS_BIDS) ?? "{}") as Record<string, UserBid[]>;
    const mine = Array.isArray(all[cycleId]) ? all[cycleId]! : [];
    // Keep the store bounded: this cycle + the 11 highest (most recent)
    // cycle indexes — cycle index is the number after the ":".
    const next: Record<string, UserBid[]> = { [cycleId]: [...mine, bid] };
    const recent = Object.keys(all)
      .filter((k) => k !== cycleId)
      .sort((a, b) => Number(b.split(":")[1] ?? 0) - Number(a.split(":")[1] ?? 0))
      .slice(0, 11);
    for (const k of recent) next[k] = all[k]!;
    localStorage.setItem(LS_BIDS, JSON.stringify(next));
  } catch {
    /* private mode — in-memory replay still works via the caller's state */
  }
}

/** Pre-bids armed from the droplist, applied when that room's next lot opens. */
export function readPrebid(roomId: string): number | null {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PREBIDS) ?? "{}") as Record<string, number>;
    return Number.isFinite(all[roomId]) ? all[roomId]! : null;
  } catch {
    return null;
  }
}

export function writePrebid(roomId: string, maxSen: number | null): void {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PREBIDS) ?? "{}") as Record<string, number>;
    if (maxSen === null) delete all[roomId];
    else all[roomId] = maxSen;
    localStorage.setItem(LS_PREBIDS, JSON.stringify(all));
  } catch {
    /* best-effort */
  }
}

export interface AuctionState {
  config: AuctionConfig;
  product: Product;
  phase: AuctionPhase;
  cycleId: string;
  previewAt: number;
  startAt: number;
  /** Dynamic — soft-close extensions move it; capped at startAt+BASE+MAX_EXT. */
  endAt: number;
  /** Current high bid (the price on the card). */
  priceSen: number;
  /** Next valid bid from here. */
  nextBidSen: number;
  leaderName: string;
  leaderIsYou: boolean;
  userMaxSen: number | null;
  /** True the moment a soft-close extension fires (for the "+10s" flash). */
  extended: boolean;
  bidCount: number;
  /** Full bid tape, chronological (for chat toasts — emit the tail). */
  bids: BidEvent[];
  /** Sold-phase verdicts. */
  youWon: boolean;
  youParticipated: boolean;
}

/**
 * Replay the auction for `roomId` at wall-clock `now`, merging the seeded
 * rival schedule with the user's persisted bids. Deterministic and cheap
 * (tens of events), so callers just re-run it every tick.
 */
export function auctionState(roomId: string, now: number, userBids?: UserBid[]): AuctionState | null {
  const config = AUCTIONS[roomId];
  if (!config) return null;
  const product = demoProducts.find((p) => p.id === config.productId);
  if (!product) return null;

  const cycleIndex = Math.floor(now / CYCLE_MS);
  const cycleStart = cycleIndex * CYCLE_MS;
  const cycleId = `${roomId}:${cycleIndex}`;
  const previewAt = cycleStart + IDLE_MS;
  const startAt = previewAt + PREVIEW_MS;
  const hardEnd = startAt + BASE_MS + MAX_EXT_MS;

  const actions = (userBids ?? readUserBids(cycleId)).slice().sort((a, b) => a.at - b.at);

  // Rival appetite for this cycle: how high the room will go. Seeded so some
  // lots go cheap (~55% of the start→list gap) and some run past list (~130%,
  // auction fever) — but never cartoonishly above it.
  const heat = seed01(cycleId);
  const ceilingSen = roundToInc(config.startPriceSen + Math.round((0.55 + heat * 0.75) * (product.priceSen - config.startPriceSen)));

  // ── the replay ──
  let price = 0; // 0 = no bids yet; first bid takes startPrice
  let leaderIsYou = false;
  let rivalIdx = Math.floor(seed01(`${cycleId}:r`) * RIVALS.length);
  let leaderName = "";
  let userMax: number | null = null;
  let endAt = startAt + BASE_MS;
  let extended = false;
  const bids: BidEvent[] = [];
  let ai = 0; // next user action
  let k = 0; // rival attempt counter

  const accept = (at: number, amountSen: number, isYou: boolean, name: string) => {
    price = amountSen;
    leaderIsYou = isYou;
    leaderName = name;
    bids.push({ at, name, amountSen, isYou });
    if (endAt - at < SOFT_MS) {
      const nextEnd = Math.min(at + SOFT_MS, hardEnd);
      if (nextEnd > endAt) extended = true;
      endAt = nextEnd;
    }
  };

  // Rival attempt times are seeded gaps from the previous event; rivals keep
  // going while the price is under their ceiling, which naturally snipes into
  // the soft-close window and extends the clock — until the ceiling stops them.
  let cursor = startAt + 2000 + Math.round(seed01(`${cycleId}:t0`) * 5000);
  const clock = Math.min(now, hardEnd);

  while (true) {
    const nextAction = ai < actions.length ? actions[ai]! : null;
    const nextEvent = Math.min(nextAction ? nextAction.at : Infinity, cursor);
    if (nextEvent > clock || nextEvent >= endAt) break;

    if (nextAction && nextAction.at <= cursor) {
      // User raises their max. UI enforces validity; the replay re-checks.
      const need = price === 0 ? config.startPriceSen : price + bidIncrement(price);
      if (nextAction.maxSen > (userMax ?? 0)) userMax = nextAction.maxSen;
      if (!leaderIsYou && userMax !== null && userMax >= need) {
        accept(nextAction.at, need, true, "you");
      }
      ai++;
      continue;
    }

    // Rival attempt at `cursor` — only while the room's appetite holds.
    const need = price === 0 ? config.startPriceSen : price + bidIncrement(price);
    if (need <= ceilingSen) {
      rivalIdx = (rivalIdx + 1) % RIVALS.length;
      if (userMax !== null && userMax >= need) {
        // The proxy answers within the same beat: rival pushes to `need`,
        // the user auto-rebids min(need+inc, max). On an exact tie
        // (userMax === need) the standing proxy re-takes at the same price —
        // eBay's rule: the earlier max wins.
        accept(cursor, need, false, RIVALS[rivalIdx]!);
        accept(cursor, Math.min(need + bidIncrement(need), userMax), true, "you");
      } else {
        accept(cursor, need, false, RIVALS[rivalIdx]!);
      }
    }
    // Pace: quicker beats inside the last 20s (the rush), else 3–10s.
    k++;
    const gap = 3000 + Math.round(seed01(`${cycleId}:g${k}`) * 7000);
    cursor += endAt - cursor < 20_000 ? Math.max(1500, Math.round(gap * 0.45)) : gap;
  }

  // Process any user actions that land after rivals went quiet.
  while (ai < actions.length && actions[ai]!.at <= clock && actions[ai]!.at < endAt) {
    const a = actions[ai]!;
    const need = price === 0 ? config.startPriceSen : price + bidIncrement(price);
    if (a.maxSen > (userMax ?? 0)) userMax = a.maxSen;
    if (!leaderIsYou && userMax !== null && userMax >= need) accept(a.at, need, true, "you");
    ai++;
  }

  let phase: AuctionPhase;
  if (now < previewAt) phase = "idle";
  else if (now < startAt) phase = "preview";
  else if (now < endAt) phase = "live";
  else phase = "sold";

  const displayPrice = price === 0 ? config.startPriceSen : price;
  return {
    config,
    product,
    phase,
    cycleId,
    previewAt,
    startAt,
    endAt,
    priceSen: displayPrice,
    nextBidSen: price === 0 ? config.startPriceSen : price + bidIncrement(price),
    leaderName,
    leaderIsYou,
    userMaxSen: userMax,
    extended,
    bidCount: bids.length,
    bids,
    youWon: phase === "sold" && leaderIsYou && bids.length > 0,
    youParticipated: actions.length > 0,
  };
}

function roundToInc(sen: number): number {
  const inc = bidIncrement(sen);
  return Math.round(sen / inc) * inc;
}

/** Place a bid/raise the max for the running cycle. Returns the recorded bid. */
export function placeUserBid(state: AuctionState, maxSen: number, now: number): UserBid | null {
  if (state.phase !== "live") return null;
  if (maxSen < state.nextBidSen && !(state.leaderIsYou && maxSen > (state.userMaxSen ?? 0))) return null;
  const bid: UserBid = { at: now, maxSen };
  writeUserBid(state.cycleId, bid);
  return bid;
}
