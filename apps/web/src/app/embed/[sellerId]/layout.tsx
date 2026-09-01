import type { Metadata } from "next";

// The widget is meant to live inside OTHER sites — never in search results.
export const metadata: Metadata = {
  title: "Host widget",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
