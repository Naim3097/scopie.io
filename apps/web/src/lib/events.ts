"use client";

import type { EngagementEvent } from "@scopie/core";
import { API_BASE, DEMO_MODE } from "./api";

/**
 * Client event tracker: batches engagement events and flushes every 3 s or on
 * page hide. This stream is the raw material for every future recommender —
 * instrumented from day one.
 *
 * Delivery notes (hard-won):
 *  - sendBeacon payloads use text/plain so the cross-origin beacon stays
 *    CORS-preflight-free (an application/json Blob forces a preflight that
 *    races page teardown and drops on iOS). The API parses text bodies.
 *  - Both `visibilitychange` AND `pagehide` are handled — older iOS Safari
 *    misses visibilitychange on same-tab navigations (e.g. into checkout).
 *  - Failed fetch flushes re-queue their events instead of discarding them.
 */

let queue: EngagementEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function anonId(): string {
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

export function track(event: Omit<EngagementEvent, "userId" | "ts">): void {
  if (DEMO_MODE) return; // no API configured — never build an unbounded queue
  queue.push({ ...event, userId: anonId(), ts: new Date().toISOString() } as EngagementEvent);
  if (queue.length >= 20) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => void flush(), 3000);
  }
}

export async function flush(useBeacon = false): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (DEMO_MODE || queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const payload = JSON.stringify({ events });
  try {
    if (useBeacon && "sendBeacon" in navigator) {
      // text/plain keeps the beacon preflight-free; delivery is best-effort.
      const ok = navigator.sendBeacon(`${API_BASE}/v1/events`, new Blob([payload], { type: "text/plain" }));
      if (!ok) queue.unshift(...events);
      return;
    }
    const res = await fetch(`${API_BASE}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    });
    if (!res.ok) queue.unshift(...events);
  } catch {
    // Network hiccup: keep the events for the next flush. The server never
    // trusts client events for money, so at-least-once is fine.
    queue.unshift(...events);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
  window.addEventListener("pagehide", () => void flush(true));
}
