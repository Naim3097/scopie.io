/**
 * SCOP + streaks (Rehearsal tier). Points are EARNED, never bought: showing
 * up, claiming drops, winning lots, entering giveaways, sharing. Everything
 * lives on this device (localStorage) until the wallet backend owns it —
 * the ProfilePanel says so. Days are MALAYSIA days (UTC+8): a streak that
 * flips at 8am would be nonsense for a 9PM show ritual.
 */

export type ScopKind =
  | "checkin"
  | "attend"
  | "drop"
  | "auction"
  | "giveaway_enter"
  | "giveaway_win"
  | "share"
  | "prebid";

export const SCOP_PTS: Record<ScopKind, number> = {
  checkin: 5,
  attend: 10,
  drop: 15,
  auction: 25,
  giveaway_enter: 5,
  giveaway_win: 20,
  share: 5,
  prebid: 5,
};

const NOTE: Record<ScopKind, string> = {
  checkin: "Showed up today",
  attend: "Watched a live show",
  drop: "Claimed a drop",
  auction: "Won a lot",
  giveaway_enter: "Entered the giveaway",
  giveaway_win: "Won the giveaway",
  share: "Shared a moment",
  prebid: "Armed a pre-bid",
};

export interface ScopEvent {
  at: number;
  kind: ScopKind;
  pts: number;
  /** Dedupe key — one award per key, ever (cycleIds, day-stamps). */
  key: string;
  note: string;
}

interface ScopStore {
  balance: number;
  ledger: ScopEvent[];
}

const LS_SCOP = "scopie_scop";
const LS_DAYS = "scopie_days";

/** Malaysia-time day stamp (UTC+8, no DST). */
export function mytDay(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export function readScop(): ScopStore {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SCOP) ?? "null") as ScopStore | null;
    if (raw && Number.isFinite(raw.balance) && Array.isArray(raw.ledger)) return raw;
  } catch {
    /* fall through */
  }
  return { balance: 0, ledger: [] };
}

/**
 * Award points once per key. Returns the points granted, or null when this
 * key was already awarded (the caller shows no toast then).
 */
export function award(kind: ScopKind, key: string, now = Date.now()): number | null {
  try {
    const store = readScop();
    if (store.ledger.some((e) => e.key === key)) return null;
    const pts = SCOP_PTS[kind];
    const event: ScopEvent = { at: now, kind, pts, key, note: NOTE[kind] };
    // The balance is authoritative; the ledger is a capped view of history.
    const next: ScopStore = { balance: store.balance + pts, ledger: [event, ...store.ledger].slice(0, 60) };
    localStorage.setItem(LS_SCOP, JSON.stringify(next));
    markDay(now);
    return pts;
  } catch {
    return null; // private mode — points resume when storage does
  }
}

/** Record that today (MYT) counted — streaks are made of these. */
export function markDay(now = Date.now()): void {
  try {
    const day = mytDay(now);
    const raw = JSON.parse(localStorage.getItem(LS_DAYS) ?? "[]") as unknown;
    const days = Array.isArray(raw) ? (raw as string[]) : [];
    if (!days.includes(day)) localStorage.setItem(LS_DAYS, JSON.stringify([day, ...days].slice(0, 60)));
  } catch {
    /* best-effort */
  }
}

/** Consecutive MYT days ending today (or yesterday, so a streak survives
 *  until the day is actually over). */
export function streakDays(now = Date.now()): number {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_DAYS) ?? "[]") as unknown;
    const days = new Set(Array.isArray(raw) ? (raw as string[]) : []);
    if (days.size === 0) return 0;
    const DAY = 86_400_000;
    let cursor = now;
    if (!days.has(mytDay(cursor))) cursor -= DAY; // today not yet counted
    let n = 0;
    while (days.has(mytDay(cursor))) {
      n++;
      cursor -= DAY;
    }
    return n;
  } catch {
    return 0;
  }
}
