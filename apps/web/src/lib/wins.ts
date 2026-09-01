/**
 * One persisted "already handled" set for win commits (auction hammers,
 * giveaway claims). The win itself is a pure replay of clock + seeds, so it
 * re-derives true for the whole result window — the CART COMMIT must not:
 * a refresh mid-window would otherwise re-add the line on every mount.
 */

const LS_WINS = "scopie_wins_handled";

export function winHandled(cycleId: string): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(LS_WINS) ?? "[]") as unknown;
    return Array.isArray(all) && all.includes(cycleId);
  } catch {
    return false;
  }
}

export function markWinHandled(cycleId: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(LS_WINS) ?? "[]") as unknown;
    const list = Array.isArray(all) ? (all as string[]) : [];
    if (!list.includes(cycleId)) localStorage.setItem(LS_WINS, JSON.stringify([cycleId, ...list].slice(0, 40)));
  } catch {
    /* private mode — the in-memory ref still guards this session */
  }
}
