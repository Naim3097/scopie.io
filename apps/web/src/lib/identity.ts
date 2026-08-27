"use client";

/** Stable anonymous client id — the guest identity and the anon event actor. */
export function getClientId(): string {
  try {
    const key = "scopie_anon_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `anon:${crypto.randomUUID()}`;
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
