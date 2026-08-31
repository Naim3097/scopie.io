"use client";

import { HelmetMark } from "@/components/Brand";
import { useCommerce } from "@/components/commerce/Commerce";
import { PATHS } from "@/components/Glyph";
import { useCart } from "@/lib/cart";

export type PanelKind = "search" | "create" | "ask" | "profile";

function Glyph({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}

/**
 * The surface chrome. No destinations — every item opens an overlay on the
 * one surface. The scopie orb sits center: the AI is the middle of the app.
 */
export function SurfaceDock({ onOpen }: { onOpen: (panel: PanelKind) => void }) {
  const cart = useCart();
  const { openCart } = useCommerce();
  return (
    <nav className="bottomnav" aria-label="Scopie">
      <div className="bottomnav-in">
        <button className="navitem" aria-label="Discover" onClick={() => onOpen("search")}>
          <Glyph kind="discover" />
        </button>
        <button className="navitem" aria-label="Create" onClick={() => onOpen("create")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5.5v13M5.5 12h13" />
          </svg>
        </button>
        <button className="navitem nav-orb" aria-label="Ask Scopie" onClick={() => onOpen("ask")}>
          <span className="dock-orb" aria-hidden="true">
            <HelmetMark size={26} fill="#ffffff" />
          </span>
        </button>
        <button className="navitem" aria-label={`Bag${cart.count > 0 ? `, ${cart.count} items` : ""}`} onClick={openCart}>
          <span className="dock-bag">
            <Glyph kind="bag" />
            {cart.count > 0 && <span className="cart-count">{cart.count}</span>}
          </span>
        </button>
        <button className="navitem" aria-label="Profile" onClick={() => onOpen("profile")}>
          <Glyph kind="user" />
        </button>
      </div>
    </nav>
  );
}
