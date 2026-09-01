import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shopping, live. Hosted by AI.",
  description:
    "Real Malaysian brands, live shows with named AI hosts that actually answer, and checkout where your money is held until your order arrives.",
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
