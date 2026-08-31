"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE, DEMO_MODE } from "@/lib/api";
import { Hero } from "@/components/Glyph";
import { useCart } from "@/lib/cart";
import { getAuthHeaders } from "@/lib/supabase";

type ViewState = "checking" | "paid" | "failed" | "pending" | "demo" | "none" | "signin";

/**
 * Landing here proves only that the gateway redirected back — it happens on
 * cancel, failure, and pending too. The page therefore asks the API for the
 * order's webhook-verified status and never claims success on its own.
 */
function ReturnInner() {
  const params = useSearchParams();
  const demo = params.get("demo_paid") === "1";
  const orderId = params.get("order");
  const fromCart = params.get("from_cart") === "1";
  const purchasedLine = params.get("pline");
  const cart = useCart();
  const [state, setState] = useState<ViewState>(demo ? "demo" : "checking");

  // The cart only changes once the outcome exists: a demo success clears it
  // here; a real payment removes the purchased line when status turns paid.
  // (Cancelling at the gateway keeps the cart intact.)
  useEffect(() => {
    if (demo && fromCart) cart.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, fromCart]);
  useEffect(() => {
    if (state === "paid" && purchasedLine) cart.remove(purchasedLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, purchasedLine]);

  useEffect(() => {
    if (demo || !orderId || DEMO_MODE) {
      // No order reference (direct visit, stripped params) or no payment rail
      // at all: never claim a bank transaction is in flight.
      if (!demo) setState(orderId && !DEMO_MODE ? "pending" : "none");
      // With a local API running, poke the status endpoint once so its demo
      // order runs the full markPaid/escrow flow (best-effort).
      if (demo && orderId && !DEMO_MODE) {
        void getAuthHeaders()
          .then((headers) =>
            fetch(`${API_BASE}/v1/payments/orders/${orderId}/status`, { cache: "no-store", headers }),
          )
          .catch(() => undefined);
      }
      return;
    }
    let attempts = 0;
    let stopped = false;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(`${API_BASE}/v1/payments/orders/${orderId}/status`, {
          cache: "no-store",
          headers: await getAuthHeaders(),
        });
        if (res.status === 401) {
          // Session lost across the bank redirect — ask them to sign back in
          // and land right back on this status page.
          if (!stopped) setState("signin");
          return;
        }
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
    checking: { icon: "clock", tone: "brand", title: "Confirming your payment…", sub: "This usually takes a few seconds." },
    paid: { icon: "check", tone: "good", title: "Payment received", sub: "Your order is confirmed and held safely until delivery." },
    failed: { icon: "cross", tone: "bad", title: "Payment not completed", sub: "No money was taken. You can try again from the product page." },
    pending: {
      icon: "clock",
      tone: "brand",
      title: "Payment processing",
      sub: "We're waiting for your bank's confirmation — keep this page's link to check back any time.",
    },
    demo: {
      icon: "check",
      tone: "good",
      title: "Demo checkout complete",
      sub: "No money moved. With a configured gateway, the order would now be in escrow until delivery.",
    },
    none: {
      icon: "bag",
      tone: "brand",
      title: "No order to show",
      sub: "There's nothing waiting here — browse Discover to find something you'll love.",
    },
    signin: {
      icon: "lock",
      tone: "brand",
      title: "Sign in to see your order",
      sub: "You were signed out during payment. Sign back in and we'll show your order status.",
    },
  }[state] as { icon: string; tone: "brand" | "good" | "bad"; title: string; sub: string };

  const backHref =
    state === "signin" && orderId
      ? `/auth?next=${encodeURIComponent(`/pay/return?order=${orderId}`)}`
      : "/";
  const backLabel = state === "signin" ? "Sign in" : "Back to Scopie";

  return (
    <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
      <Hero kind={view.icon} tone={view.tone} />
      <h1 className="page-title">{view.title}</h1>
      <p className="page-sub">{view.sub}</p>
      <Link href={backHref} className={state === "signin" ? "btn btn-primary" : "btn btn-ghost"} style={{ width: "auto" }}>
        {backLabel}
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
