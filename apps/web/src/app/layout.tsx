import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL("https://scopie.io"),
  alternates: { canonical: "/" },
  title: { default: "Scopie", template: "%s · Scopie" },
  description: "Discover what's next, just for you. Social shopping with your AI personal shopper.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Scopie" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Scopie",
    description: "Discover what's next, just for you. Social shopping with your AI personal shopper.",
    url: "https://scopie.io",
    siteName: "Scopie",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
    type: "website",
  },
};

// No maximumScale: pinch-to-zoom stays available (WCAG 1.4.4); inputs use
// >=16px fonts so iOS focus auto-zoom doesn't fire anyway.
export const viewport: Viewport = {
  themeColor: "#F6F6FB",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* Font FILES come from gstatic — without this preconnect, the first
            paint pays a full extra DNS+TLS round trip on mobile. */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <PwaRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
