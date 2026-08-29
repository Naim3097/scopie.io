import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font: no render-blocking round trip to Google on
// every cold launch, and a metric-adjusted fallback so the swap is CLS-free.
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });
import { AppShell } from "@/components/AppShell";
import { CommerceProvider } from "@/components/commerce/Commerce";
import { PwaRegister } from "@/components/PwaRegister";
import { CartProvider } from "@/lib/cart";
import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = {
  metadataBase: new URL("https://scopie.io"),
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
  themeColor: "#F8F9FC",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <PwaRegister />
        <SessionProvider>
          <CartProvider>
            <CommerceProvider>
              <AppShell>{children}</AppShell>
            </CommerceProvider>
          </CartProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
