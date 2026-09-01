"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HelmetMark } from "@/components/Brand";
import { useCommerce } from "@/components/commerce/Commerce";
import { PATHS } from "@/components/Glyph";
import { useCart } from "@/lib/cart";

export type PanelKind = "search" | "create" | "ask" | "profile";

function Glyph({ kind, size = 20 }: { kind: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}

interface ArcItem {
  key: string;
  label: string;
  /** degrees from the horizontal, measured at the bottom-right corner */
  angle: number;
  radius: number;
  delay: number;
  render: React.ReactNode;
  className: string;
  action: "search" | "create" | "ask" | "profile" | "cart" | "home";
}

/* Two arcs out of the corner. Inner ring: utilities. Outer ring: the three
   module identities from the gateway — the tiles ARE the navigation. */
const ITEMS: ArcItem[] = [
  // inner ring
  { key: "search", label: "Discover", angle: 18, radius: 92, delay: 0, className: "corner-glyph", action: "search", render: <Glyph kind="discover" /> },
  { key: "ask", label: "Ask Scopie", angle: 50, radius: 92, delay: 30, className: "corner-glyph corner-glyph--spark", action: "ask", render: <Glyph kind="spark" size={18} /> },
  { key: "create", label: "Create", angle: 82, radius: 92, delay: 60, className: "corner-glyph", action: "create", render: (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  ) },
  // outer ring — Scopping (cart & orders), Scopay (profile & wallet), Scopios (the feed)
  { key: "scopping", label: "Scopping — Cart & Orders", angle: 18, radius: 158, delay: 45, className: "corner-mod hub-tile--midnight", action: "cart", render: <HelmetMark size={26} fill="#ffffff" /> },
  { key: "scopay", label: "Scopay — Profile & Wallet", angle: 50, radius: 158, delay: 75, className: "corner-mod hub-tile--violet", action: "profile", render: <HelmetMark size={26} fill="#ffffff" /> },
  { key: "scopios", label: "Scopios — the feed", angle: 82, radius: 158, delay: 105, className: "corner-mod hub-tile--pearl", action: "home", render: <HelmetMark size={26} fill="gradient" /> },
];

const NAMES: Record<string, string> = { scopping: "Scopping", scopay: "Scopay", scopios: "Scopios" };

/**
 * The quarter-circle: Scopie's entire navigation lives in the bottom-right
 * corner — a thumb-native orb that blooms two arcs of icons over the
 * full-bleed surface. Nothing else chromes the screen.
 */
export function CornerNav({ onOpen }: { onOpen: (panel: PanelKind) => void }) {
  const [open, setOpen] = useState(false);
  const cart = useCart();
  const { openCart } = useCommerce();
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Esc closes; so does any tap outside the fan.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const act = (item: ArcItem) => {
    close();
    if (item.action === "home") return; // the surface IS home
    if (item.action === "cart") return openCart();
    onOpen(item.action);
  };

  return (
    <div ref={rootRef} className={`corner${open ? " corner--open" : ""}`}>
      {open && <button className="corner-scrim" aria-label="Close menu" onClick={close} />}
      <nav className="corner-fan" aria-label="Scopie navigation" aria-hidden={!open}>
        {ITEMS.map((item) => {
          const rad = (item.angle * Math.PI) / 180;
          const tx = -(Math.cos(rad) * item.radius);
          const ty = -(Math.sin(rad) * item.radius);
          return (
            <button
              key={item.key}
              className={`corner-item ${item.className}`}
              style={
                {
                  "--tx": `${tx.toFixed(1)}px`,
                  "--ty": `${ty.toFixed(1)}px`,
                  // MUI SpeedDial cascade: 30ms per step out, reversed on
                  // close so the arc retracts tip-to-base.
                  transitionDelay: open ? `${item.delay}ms` : `${105 - item.delay}ms`,
                } as React.CSSProperties
              }
              tabIndex={open ? 0 : -1}
              aria-label={item.label}
              onClick={() => act(item)}
            >
              {item.render}
              {NAMES[item.key] && (
                <span className="corner-name" aria-hidden="true">
                  {NAMES[item.key]}
                </span>
              )}
              {item.action === "cart" && cart.count > 0 && <span className="cart-count">{cart.count}</span>}
            </button>
          );
        })}
      </nav>
      <button
        className="corner-orb"
        aria-expanded={open}
        aria-label={open ? "Close Scopie menu" : "Open Scopie menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="corner-orb-mark" aria-hidden="true">
          <HelmetMark size={30} fill="#ffffff" />
        </span>
        {!open && cart.count > 0 && <span className="cart-count corner-count">{cart.count}</span>}
      </button>
    </div>
  );
}
