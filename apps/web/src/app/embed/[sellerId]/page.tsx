"use client";

import { useParams } from "next/navigation";
import { HostWidget } from "@/components/embed/HostWidget";
import { demoSellers } from "@/lib/demo";

/**
 * The embeddable host — /embed/<sellerId> serves ONLY the widget, so a
 * business can iframe their own named AI host (<business>.ai) into their
 * existing site. The /brands page demos exactly this, live.
 */
export default function EmbedPage() {
  const params = useParams<{ sellerId: string }>();
  const sellerId = (() => {
    try {
      return decodeURIComponent(params.sellerId ?? "");
    } catch {
      return params.sellerId ?? "";
    }
  })();

  if (!demoSellers[sellerId]) {
    return (
      <main className="hw-page">
        <p className="section-note" style={{ textAlign: "center" }}>
          No host here yet — this business isn&rsquo;t on Scopie.
        </p>
      </main>
    );
  }

  return (
    <main className="hw-page">
      <HostWidget sellerId={sellerId} />
    </main>
  );
}
