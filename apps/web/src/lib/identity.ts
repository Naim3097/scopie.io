"use client";

/**
 * v4 UUID that works on every WebView: crypto.randomUUID when present,
 * getRandomValues otherwise, and a last-resort Math.random shape so old
 * devices still mint unique, server-acceptable ids.
 */
export function uuid4(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6]! & 0x0f) | 0x40;
      b[8] = (b[8]! & 0x3f) | 0x80;
      const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
  } catch {
    /* fall through */
  }
  const rand = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${rand(8)}-${rand(4)}-4${rand(3)}-8${rand(3)}-${rand(12)}`;
}

/** Stable anonymous client id — the guest identity and the anon event actor. */
export function getClientId(): string {
  try {
    const key = "scopie_anon_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `anon:${uuid4()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anon:unknown";
  }
}

/** The bare id (no prefix) — what the API's guest header expects. */
export function getGuestHeaderId(): string {
  return getClientId().replace(/^anon:/, "");
}
