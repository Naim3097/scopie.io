"use client";

/**
 * Device-local social state: video comments and creator follows. Comments
 * and follows persist per device until the social backend owns them — the
 * comments API lands with accounts (the `comments` table already exists in
 * the schema).
 */

export interface VideoComment {
  id: string;
  from: string;
  text: string;
  at: number;
  mine?: boolean;
}

const LS_COMMENTS = "scopie_comments";
const LS_FOLLOWS = "scopie_follows";
const MAX_PER_VIDEO = 100;
const MAX_VIDEOS = 50;

/** Deterministic seeded comments so every demo video feels alive. */
const SEEDS: [string, string][] = [
  ["Mira", "Obsessed with this"],
  ["Aqil", "Where can I get one?"],
  ["Jo", "The quality looks amazing"],
  ["Nadia", "Adding to cart right now"],
  ["Ray", "Been waiting for a restock!"],
  ["Syaz", "This is so my style"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function seededFor(videoId: string): VideoComment[] {
  const n = 2 + (hash(videoId) % 3); // 2..4 seeded comments per video
  const start = hash(videoId) % SEEDS.length;
  return Array.from({ length: n }, (_, i) => {
    const [from, text] = SEEDS[(start + i) % SEEDS.length]!;
    return { id: `seed_${videoId}_${i}`, from, text, at: 0 };
  });
}

type Store = Record<string, VideoComment[]>;

function loadStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_COMMENTS) ?? "{}") as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    return raw as Store;
  } catch {
    return {};
  }
}

function persistStore(store: Store): void {
  try {
    const ids = Object.keys(store);
    // Bound total storage: keep the most recently commented videos.
    if (ids.length > MAX_VIDEOS) {
      const trimmed: Store = {};
      for (const id of ids.slice(-MAX_VIDEOS)) trimmed[id] = store[id]!;
      store = trimmed;
    }
    localStorage.setItem(LS_COMMENTS, JSON.stringify(store));
  } catch {
    /* best-effort */
  }
}

/** Guard against a corrupted/foreign snapshot — a string where a list should be. */
function ownList(store: Store, videoId: string): VideoComment[] {
  const list = store[videoId];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (c): c is VideoComment =>
      typeof c === "object" && c !== null && typeof c.text === "string" && typeof c.from === "string",
  );
}

export function commentsFor(videoId: string): VideoComment[] {
  return [...seededFor(videoId), ...ownList(loadStore(), videoId)];
}

export function ownCommentCount(videoId: string): number {
  return ownList(loadStore(), videoId).length;
}

export function addComment(videoId: string, text: string, from: string): VideoComment | null {
  const clean = text.trim().slice(0, 300);
  if (!clean) return null;
  const store = loadStore();
  const list = ownList(store, videoId);
  // Re-inserting moves the key to the end, so the MAX_VIDEOS trim really
  // evicts the least-recently-commented video, not the first-ever one.
  delete store[videoId];
  const comment: VideoComment = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from,
    text: clean,
    at: Date.now(),
    mine: true,
  };
  store[videoId] = [...list, comment].slice(-MAX_PER_VIDEO);
  persistStore(store);
  return comment;
}

/* ── follows ────────────────────────────────────────────────────────── */

function loadFollows(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_FOLLOWS) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isFollowing(handle: string): boolean {
  return loadFollows().includes(handle);
}

export function toggleFollow(handle: string): boolean {
  const follows = loadFollows();
  const next = follows.includes(handle) ? follows.filter((h) => h !== handle) : [...follows, handle].slice(-200);
  try {
    localStorage.setItem(LS_FOLLOWS, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next.includes(handle);
}
