"use client";

import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect fires before paint on client navigations — the whole point
// is to suppress the intro before the first frame. Server render falls back
// to useEffect purely to keep React's SSR warning quiet.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Marks the hub intro as seen: first visit animates, returns are instant. */
export function HubIntroOnce() {
  useIsoLayoutEffect(() => {
    try {
      if (sessionStorage.getItem("scopie_hub_seen")) {
        document.documentElement.classList.add("hub-seen");
      }
      sessionStorage.setItem("scopie_hub_seen", "1");
    } catch {
      /* private mode / storage blocked — the intro just replays */
    }
  }, []);
  return null;
}
