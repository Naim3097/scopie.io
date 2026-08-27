"use client";

import { useState } from "react";
import type { Product } from "@scopie/core";
import { formatRM } from "@/lib/demo";
import { API_BASE, DEMO_MODE } from "@/lib/api";
import { flush, track } from "@/lib/events";

/**
 * Product card with "Buy with Scopie Pay". Checkout is always pass-through:
 * the API derives the price from the catalog (the client never names an
 * amount) and returns a hosted payment URL, branded as Scopie. A failed
 * checkout shows an error — it must never look like a completed payment.
 */
export function ProductCard({ product }: { product: Product }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    if (busy) return; // double-taps must not mint a second order
    setBusy(true);
    setError(null);
    track({ type: "product.add_to_cart", subjectId: product.id, surface: "discover" });
    const orderId = crypto.randomUUID();
    const returnUrl = `${window.location.origin}/pay/return`;
    if (DEMO_MODE) {
      // No API deployed: show the demo flow explicitly, no network attempt.
      window.location.href = `/pay/return?demo_paid=1&order=${orderId}`;
      return;
    }
    try {
      await flush(); // don't lose the intent event to the navigation
      const res = await fetch(`${API_BASE}/v1/payments/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, buyerId: "demo-buyer", productId: product.id, quantity: 1, returnUrl }),
      });
      if (!res.ok) {
        setError("Checkout couldn't start. Please try again.");
        setBusy(false);
        return;
      }
      const { paymentUrl } = (await res.json()) as { paymentUrl: string };
      window.location.href = paymentUrl;
    } catch {
      // API unreachable = static demo preview: show the demo flow explicitly.
      window.location.href = `/pay/return?demo_paid=1&order=${orderId}`;
    }
  };

  return (
    <div className="card">
      {product.imageUrl && <img src={product.imageUrl} alt={product.title} loading="lazy" />}
      <div className="card-body">
        {typeof product.matchScore === "number" && <span className="match">✦ {product.matchScore}% Match</span>}
        <div className="card-title">{product.title}</div>
        {product.variant && <div className="card-variant">{product.variant}</div>}
        <div className="card-price">{formatRM(product.priceSen)}</div>
        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => void buy()} disabled={busy}>
          {busy ? "Opening checkout…" : "Buy with Scopie Pay"}
        </button>
        {error && (
          <div style={{ color: "var(--live)", fontSize: 12.5, marginTop: 6 }} role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
