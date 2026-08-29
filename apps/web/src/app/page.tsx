import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { HelmetMark, Wordmark } from "@/components/Brand";
import { HubIntroOnce } from "@/components/HubIntroOnce";

// The layout no longer sets a canonical (it would claim every route for "/");
// the hub is the one page that IS "/".
export const metadata: Metadata = { alternates: { canonical: "/" } };
// Match the Android status bar to the hub's lavender ground (top-edge ≈ #f6f5fc);
// other routes keep the root Cloud White.
export const viewport: Viewport = { themeColor: "#f6f5fc" };

/* The gateway. Three tiles, three surfaces of one marketplace — the tile
   treatments are the three official app-icon variants from the brand sheet
   (assets/app concept reference/app main page.jpeg). */
const MODULES = [
  {
    href: "/profile",
    head: "Sco",
    tail: "pay",
    desc: "Profile & Wallet",
    tile: "violet",
    helmet: "#ffffff",
  },
  {
    href: "/shop",
    head: "Sco",
    tail: "pping",
    desc: "Cart & Orders",
    tile: "midnight",
    helmet: "#ffffff",
  },
  {
    href: "/feed",
    head: "Scop",
    tail: "ios",
    desc: "Social & Live Feed",
    tile: "pearl",
    helmet: "gradient",
  },
] as const;

export default function Home() {
  return (
    <main className="hub-scene">
      <HubIntroOnce />
      <div className="hub">
        {/* aria-label is prohibited naming on <p> — sr-only text instead. */}
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
              <Link key={m.href} href={m.href} className="hub-mod">
                {/* Tile size lives in CSS (.hub-tile svg scales with the tile). */}
                <span className={`hub-tile hub-tile--${m.tile}`} aria-hidden="true">
                  <HelmetMark size={50} fill={m.helmet} />
                </span>
                <span className="hub-name">
                  {m.head}
                  <span className="hub-name-tail">{m.tail}</span>
                </span>
                <span className="hub-desc">{m.desc}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
