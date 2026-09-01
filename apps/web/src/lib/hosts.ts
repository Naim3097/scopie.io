/**
 * Named AI hosts — every business on Scopie gets its own host, named
 * <business>.ai (hoor.ai, kalima.ai, sugarbomb.ai…). The disclosure IS the
 * name: a .ai host can never be mistaken for a human, and the brand keeps
 * the relationship ("powered by Scopie" stays in the chip's aria).
 * Scopie's own shows are hosted by scopie.ai.
 */

export function aiHostOf(sellerId: string | null | undefined): string {
  if (!sellerId || sellerId === "scopie") return "scopie.ai";
  return `${sellerId}.ai`;
}

/** Demo rooms → their business host (API rooms will carry their own). */
const ROOM_HOSTS: Record<string, string> = {
  room_scopie_live: "scopie.ai",
  room_hoor: "hoor.ai",
  room_kalima: "kalima.ai",
  room_mael: "maelburger.ai",
};

export function roomHost(roomId: string): string {
  return ROOM_HOSTS[roomId] ?? "scopie.ai";
}

/** The standard accessible name for a host chip. */
export function hostAria(host: string): string {
  return `Hosted by ${host} — an AI host, always disclosed. Powered by Scopie.`;
}
