import { demoProducts, demoSellers } from "./catalog";

/**
 * The show spine — Scopie runs on appointments, not just a feed.
 * Client-side model for now (Rehearsal tier); the shapes become API rows
 * when the backend lands. Times are absolute epoch ms, derived from weekly
 * slots in MALAYSIA TIME (UTC+8, no DST) so "Thursday 9PM" is exact for
 * every viewer.
 */

export interface ShowSlot {
  id: string;
  title: string;
  /** Named, followable host — drops attached to anonymous brands die (NTWRK). */
  host: string;
  sellerId: string;
  /** 0=Sunday … 6=Saturday, in Malaysia time */
  weekday: number;
  hour: number;
  minute: number;
  durationMin: number;
  /** Product lineup, pinned first */
  lineup: string[];
  /** Live room this show broadcasts in (today's demo rooms) */
  roomId: string;
  accent: "violet" | "midnight" | "pearl";
  poster: string;
}

/** The fixed ritual: one anchor slot the whole platform learns by heart. */
export const SHOW_SLOTS: ShowSlot[] = [
  {
    id: "malam-drop",
    title: "Malam Drop",
    host: "scopie",
    sellerId: "sugarbomb",
    weekday: 4, // Thursday
    hour: 21,
    minute: 0,
    durationMin: 60,
    lineup: ["sugarbomb-hush-lush", "sugarbomb-midnight-oud", "sugarbomb-fresh-linen"],
    roomId: "room_scopie_live",
    accent: "violet",
    poster: "/videos/posters/kalima-ai-model.jpg",
  },
  {
    id: "hoor-tryon",
    title: "Batik Dolu-Dolu Try-On",
    host: "Aisyah",
    sellerId: "hoor",
    weekday: 0, // Sunday
    hour: 20,
    minute: 30,
    durationMin: 45,
    lineup: ["hoor-pusaka", "hoor-senja", "hoor-anggerik"],
    roomId: "room_hoor",
    accent: "midnight",
    poster: "/videos/posters/batik-traditional.jpg",
  },
  {
    id: "kalima-styling",
    title: "Raya Drop Styling",
    host: "Zara",
    sellerId: "kalima",
    weekday: 3, // Wednesday
    hour: 20,
    minute: 0,
    durationMin: 45,
    lineup: ["kalima-ruwa-caftan", "kalima-danisya-set", "kalima-chiffon-shawl"],
    roomId: "room_kalima",
    accent: "pearl",
    poster: "/videos/posters/kalima-photoshoot-2.jpg",
  },
  {
    id: "mael-smash",
    title: "Smash Night",
    host: "Mael",
    sellerId: "maelburger",
    weekday: 5, // Friday
    hour: 21,
    minute: 30,
    durationMin: 30,
    lineup: ["mael-cheezy", "mael-duo-box", "mael-loaded-fries"],
    roomId: "room_mael",
    accent: "violet",
    poster: "/videos/posters/hoor-ugc-1.jpg",
  },
];

export interface Occurrence {
  slot: ShowSlot;
  startMs: number;
  endMs: number;
  /** live while inside the window */
  state: "scheduled" | "live";
}

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Next occurrence of a weekly MYT slot at-or-after `fromMs` (or live now). */
export function nextOccurrence(slot: ShowSlot, fromMs: number): Occurrence {
  // Work in "Malaysia-shifted" time so weekday/hour math is DST-free.
  const shifted = new Date(fromMs + MYT_OFFSET_MS);
  const dayStartShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  for (let add = 0; add < 8; add++) {
    const dayShifted = dayStartShifted + add * 86400000;
    const weekday = new Date(dayShifted).getUTCDay();
    if (weekday !== slot.weekday) continue;
    const startMs = dayShifted + (slot.hour * 60 + slot.minute) * 60000 - MYT_OFFSET_MS;
    const endMs = startMs + slot.durationMin * 60000;
    if (endMs <= fromMs) continue; // already over today — next week
    return { slot, startMs, endMs, state: fromMs >= startMs ? "live" : "scheduled" };
  }
  // Unreachable (8-day scan always finds the weekday); satisfy the compiler.
  const startMs = fromMs + 7 * 86400000;
  return { slot, startMs, endMs: startMs + slot.durationMin * 60000, state: "scheduled" };
}

/** All upcoming occurrences over the next `weeks`, soonest first. */
export function upcomingShows(now: number, weeks = 4): Occurrence[] {
  const out: Occurrence[] = [];
  for (const slot of SHOW_SLOTS) {
    let cursor = now;
    for (let w = 0; w < weeks; w++) {
      const occ = nextOccurrence(slot, cursor);
      out.push(occ);
      cursor = occ.endMs + 1;
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The single next show (live or soonest scheduled). */
export function nextShow(now: number): Occurrence {
  return upcomingShows(now, 1)[0]!;
}

export function showSeller(slot: ShowSlot) {
  return demoSellers[slot.sellerId];
}

export function showLineup(slot: ShowSlot) {
  return slot.lineup
    .map((id) => demoProducts.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
}

/** "Thu 9:00 PM" in Malaysia time — the ritual reads the same everywhere. */
export function formatSlotTime(occ: Occurrence): string {
  const d = new Date(occ.startMs + MYT_OFFSET_MS);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const min = d.getUTCMinutes();
  return `${days[d.getUTCDay()]} ${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${ampm}`;
}
