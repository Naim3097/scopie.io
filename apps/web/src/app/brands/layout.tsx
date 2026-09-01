import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For brands",
  description:
    "Your brand, your show, your host — yourbrand.ai. Named AI hosts, weekly live shows, drops, auctions and escrow checkout for Malaysian brands.",
};

export default function BrandsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
