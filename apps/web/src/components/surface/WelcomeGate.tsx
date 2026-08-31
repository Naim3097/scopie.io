"use client";

import { useEffect } from "react";
import { HelmetMark, Wordmark } from "@/components/Brand";
import type { PanelKind } from "./SurfaceDock";

/** Android paints the status bar from meta theme-color — match what shows. */
function setThemeColor(color: string) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
}

/* The brand-sheet gateway, now the once-ever welcome. Visibility is decided
   BEFORE first paint by an inline script in the page (html.welcome); each
   tile enters the surface with its module's overlay. */
const MODULES = [
  {
    panel: "profile" as PanelKind | null,
    head: "Sco",
    tail: "pay",
    desc: "Profile & Wallet",
    tile: "violet",
    helmet: "#ffffff",
  },
  {
    panel: "ask" as PanelKind | null,
    head: "Sco",
    tail: "pping",
    desc: "Cart & Orders",
    tile: "midnight",
    helmet: "#ffffff",
  },
  {
    panel: null as PanelKind | null,
    head: "Scop",
    tail: "ios",
    desc: "Social & Live Feed",
    tile: "pearl",
    helmet: "gradient",
  },
] as const;

export function WelcomeGate({ onEnter }: { onEnter: (panel: PanelKind | null) => void }) {
  // While the (light lavender) gate is up, the status bar should match it,
  // not the dark surface beneath.
  useEffect(() => {
    if (document.documentElement.classList.contains("welcome")) setThemeColor("#f6f5fc");
  }, []);

  const enter = (panel: PanelKind | null) => {
    try {
      localStorage.setItem("scopie_welcomed", "1");
    } catch {
      /* private mode — the gate just shows again next launch */
    }
    document.documentElement.classList.remove("welcome");
    setThemeColor("#1b1726");
    onEnter(panel);
  };

  return (
    <div className="welcome-gate">
      <div className="hub-scene">
        <div className="hub">
          <p className="hub-brand">
            <span className="brand-visual" aria-hidden="true">
              <HelmetMark size={42} />
              <Wordmark color="#695ACD" />
            </span>
            <span className="sr-only">Scopie</span>
          </p>

          <h1 className="hub-title">
            Three ways to
            <br />
            experience Scopie.
          </h1>
          <p className="hub-sub">One seamless marketplace.</p>

          <nav className="hub-stage" aria-label="Choose an experience">
            <div className="hub-halo" aria-hidden="true" />
            <div className="hub-mods">
              {MODULES.map((m) => (
                <button key={m.tail} className="hub-mod" onClick={() => enter(m.panel)}>
                  <span className={`hub-tile hub-tile--${m.tile}`} aria-hidden="true">
                    <HelmetMark size={50} fill={m.helmet} />
                  </span>
                  <span className="hub-name">
                    {m.head}
                    <span className="hub-name-tail">{m.tail}</span>
                  </span>
                  <span className="hub-desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
