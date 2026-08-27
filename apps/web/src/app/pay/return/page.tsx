"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE, DEMO_MODE } from "@/lib/api";

type ViewState = "checking" | "paid" | "failed" | "pending" | "demo";

/**
 * Landing here proves only that the gateway redirected back — it happens on
 * cancel, failure, and pending too. The page therefore asks the API for the
 * order's webhook-verified status and never claims success on its own.
 */
function ReturnInner() {
  const params = useSearchParams();
  const demo = params.get("demo_paid") === "1";
  const orderId = params.get("order");
  const [state, setState] = useState<ViewState>(demo ? "demo" : "checking");

  useEffect(() => {
    if (demo || !orderId || DEMO_MODE) {
      if (!demo) setState("pending");
      // With a local API running, poke the status endpoint once so its demo
      // order runs the full markPaid/escrow flow (best-effort).
      if (demo && orderId && !DEMO_MODE) {
        void fetch(`${API_BASE}/v1/payments/orders/${orderId}/status`, { cache: "no-store" }).catch(() => undefined);
      }
      return;
    }
    let attempts = 0;
    let stopped = false;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(`${API_BASE}/v1/payments/orders/${orderId}/status`, { cache: "no-store" });
        if (res.ok) {
          const { status } = (await res.json()) as { status: string };
          if (stopped) return;
          if (status === "paid") return setState("paid");
          if (status === "failed" || status === "expired") return setState("failed");
        }
      } catch {
        // keep polling
      }
      if (!stopped && attempts < 10) setTimeout(() => void poll(), 2000);
      else if (!stopped) setState("pending");
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [demo, orderId]);

  const view = {
    checking: { icon: "⏳", title: "Confirming your payment…", sub: "This usually takes a few seconds." },
    paid: { icon: "✅", title: "Payment received", sub: "Your order is confirmed and held safely until delivery." },
    failed: { icon: "❌", title: "Payment not completed", sub: "No money was taken. You can try again from the product page." },
    pending: {
      icon: "⏳",
      title: "Payment processing",
      sub: "We're waiting for your bank's confirmation — we'll reflect it in your orders shortly.",
    },
    demo: {
      icon: "✅",
      title: "Demo checkout complete",
      sub: "No money moved. With a configured gateway, the order would now be in escrow until delivery.",
    },
  }[state];

  return (
    <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 56 }}>{view.icon}</div>
      <h1 className="page-title">{view.title}</h1>
      <p className="page-sub">{view.sub}</p>
      <Link href="/discover" className="btn btn-ghost">
        Back to Discover
      </Link>
    </main>
  );
}

export default function PayReturnPage() {
  return (
    <Suspense>
      <ReturnInner />
    </Suspense>
  );
}
