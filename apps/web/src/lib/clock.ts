"use client";

import { useEffect, useState } from "react";

/**
 * One shared countdown engine for the whole app. setInterval drifts and
 * background tabs throttle timers, so every consumer derives its display
 * from ABSOLUTE timestamps against Date.now(), re-synced the instant the
 * app becomes visible again (the PWA-reopen case).
 *
 * Returns null until mounted: server HTML and client hydration can never
 * agree on a wall-clock, so time-derived UI must render nothing on the
 * server (React #418 otherwise). The first real value lands within a frame.
 */
export function useNow(tickMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, tickMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tickMs]);
  return now;
}

export interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdownTo(targetMs: number, now: number): CountdownParts {
  const totalMs = Math.max(0, targetMs - now);
  const s = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

const two = (n: number) => String(n).padStart(2, "0");

/** "2d 04:16:09" beyond a day, "04:16:09" under it, "16:09" under an hour. */
export function formatCountdown(c: CountdownParts): string {
  if (c.days > 0) return `${c.days}d ${two(c.hours)}:${two(c.minutes)}:${two(c.seconds)}`;
  if (c.hours > 0) return `${two(c.hours)}:${two(c.minutes)}:${two(c.seconds)}`;
  return `${two(c.minutes)}:${two(c.seconds)}`;
}
