/**
 * Thin API client with demo fallbacks so the app runs with zero backend.
 *
 * API_BASE resolution:
 *  - NEXT_PUBLIC_API_URL when set (production once the API is hosted),
 *  - http://localhost:4000 in local dev,
 *  - "" in production with no API configured → pure demo mode: no network
 *    calls are attempted at all (a live scopie.io must never sit waiting on
 *    a dead localhost URL).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "");

export const DEMO_MODE = API_BASE === "";

/** A hung API must degrade to demo data in seconds, not browser-default minutes. */
const TIMEOUT_MS = 4000;

export async function apiGet<T>(path: string, fallback: T): Promise<T> {
  if (DEMO_MODE) return fallback;
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function apiPost<T>(path: string, body: unknown, fallback: T): Promise<T> {
  if (DEMO_MODE) return fallback;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
