import type { Viewport } from "next";

/**
 * The feed is a dark, full-bleed surface: give it dark browser chrome so the
 * status bar doesn't sit as a light lavender band over black video.
 * (Per-segment viewport must come from a server component — the feed page
 * itself is a client component.)
 */
export const viewport: Viewport = {
  themeColor: "#101120",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
