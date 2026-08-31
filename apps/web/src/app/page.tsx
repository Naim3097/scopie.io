import type { Metadata, Viewport } from "next";
import { Surface } from "@/components/surface/Surface";

/**
 * "/" IS the app: one surface (the feed, with live rooms woven in) and
 * overlays for everything else — search, create, ask-scopie, bag, profile.
 * The brand-sheet gateway survives as a once-ever welcome (WelcomeGate);
 * whether it shows is decided BEFORE first paint by the inline script below,
 * so neither state ever flashes.
 */
export const metadata: Metadata = { alternates: { canonical: "/" } };
// The surface is dark (Midnight feed ground); the welcome gate flips the
// status bar to lavender itself on the one launch it appears.
export const viewport: Viewport = { themeColor: "#1b1726" };

const WELCOME_SNIPPET =
  'try{if(!localStorage.getItem("scopie_welcomed"))document.documentElement.classList.add("welcome")}catch(e){}';

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: WELCOME_SNIPPET }} />
      <Surface />
    </>
  );
}
