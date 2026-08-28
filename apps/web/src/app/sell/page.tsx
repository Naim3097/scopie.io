"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Product } from "@scopie/core";
import { formatRM } from "@/lib/demo";
import { useSession } from "@/lib/session";
import {
  addSellerProduct,
  getSeller,
  getSellerBalanceSen,
  listSellerOrders,
  listSellerProducts,
  onboardSeller,
  shipOrder,
  type SellerOrder,
  type SellerProfile,
} from "@/lib/seller";

type Tab = "products" | "orders" | "payouts";

export default function SellPage() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [shopName, setShopName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [balance, setBalance] = useState<number>(0);

  const refresh = async () => {
    const [p, o, b] = await Promise.all([listSellerProducts(), listSellerOrders(), getSellerBalanceSen()]);
    setProducts(p);
    setOrders(o);
    setBalance(b);
  };

  useEffect(() => {
    if (session.loading) return;
    // Real-auth mode requires sign-in to sell.
    if (session.authEnabled && !session.userId) {
      router.replace(`/auth?next=${encodeURIComponent(pathname ?? "/sell")}`);
      return;
    }
    void (async () => {
      const s = await getSeller();
      setSeller(s);
      if (s) await refresh();
      setLoading(false);
    })();
  }, [session.loading, session.userId, session.authEnabled]);

  const doOnboard = async () => {
    if (busy) return;
    if (shopName.trim().length < 2) {
      setFormError("Give your shop a name (at least 2 characters).");
      return;
    }
    setFormError(null);
    setBusy(true);
    const s = await onboardSeller(shopName.trim());
    setSeller(s);
    if (s) await refresh();
    setBusy(false);
  };

  if (loading) {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 100 }}>
        <div className="buffering" style={{ position: "static" }}>
          <div className="ring" style={{ borderTopColor: "var(--accent)", borderColor: "var(--line-strong)" }}></div>
        </div>
      </main>
    );
  }

  if (!seller) {
    return (
      <main className="page page--pad">
        <div className="hero-banner" style={{ marginTop: 16 }}>
          <div className="sec-label">SELLER CENTRE</div>
          <h1>Commerce, reimagined.</h1>
          <p>Open your shop in seconds. List products, go live, and get paid in RM.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
          <input
            className="auth-input"
            placeholder="Your shop name"
            aria-label="Shop name"
            value={shopName}
            maxLength={80}
            onChange={(e) => setShopName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doOnboard()}
          />
          <button className="btn btn-primary" onClick={() => void doOnboard()} disabled={busy}>
            {busy ? "Opening your shop…" : "Open my shop"}
          </button>
          {formError && (
            <p role="alert" style={{ color: "var(--live-ink)", fontSize: 13.5, margin: 0 }}>
              {formError}
            </p>
          )}
        </div>
        <div className="section-note">
          Payouts go to your Malaysian bank account after each delivery, minus Scopie&rsquo;s commission. Bank
          details are collected when payouts open.
        </div>
      </main>
    );
  }

  return (
    <main className="page page--pad">
      <div className="topbar" style={{ padding: 0 }}>
        <div>
          <div className="sec-label">SELLER CENTRE</div>
          <h1 style={{ fontSize: 24 }}>{seller.shopName}</h1>
        </div>
        <span className="chip-good" style={{ alignSelf: "center" }}>
          <span aria-hidden="true">●</span> {seller.status}
        </span>
      </div>

      <div className="stat-row" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="k">Payable balance</div>
          <div className="v">{formatRM(balance)}</div>
        </div>
        <div className="stat">
          <div className="k">Live products</div>
          <div className="v">{products.length}</div>
        </div>
      </div>

      <div className="tabs">
        {(["products", "orders", "payouts"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab${tab === t ? " tab-active" : ""}`}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t === "products" ? "Products" : t === "orders" ? "Orders" : "Payouts"}
          </button>
        ))}
      </div>

      {tab === "products" && <SellerProducts products={products} onAdded={() => void refresh()} />}
      {tab === "orders" && <SellerOrders orders={orders} onShipped={() => void refresh()} />}
      {tab === "payouts" && (
        <div className="section-note" style={{ marginTop: 16 }}>
          Balance of <b>{formatRM(balance)}</b> is released to your bank after each order is delivered (or
          auto-confirmed 7 days after shipping). Payout scheduling arrives with the payments integration.
        </div>
      )}

      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <Link href="/studio" className="btn btn-primary" style={{ width: "auto" }}>
          Go Live
        </Link>
        <Link href="/profile" className="btn btn-ghost">
          Back to profile
        </Link>
      </div>
    </main>
  );
}

function SellerProducts({ products, onAdded }: { products: Product[]; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (busy) return;
    const priceSen = Math.round(parseFloat(price) * 100);
    if (title.trim().length < 1) {
      setError("Give the product a title.");
      return;
    }
    if (!Number.isFinite(priceSen) || priceSen < 1) {
      setError("Enter a price in RM (e.g. 59.90).");
      return;
    }
    setError(null);
    setBusy(true);
    await addSellerProduct({
      title: title.trim(),
      priceSen,
      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    });
    setTitle("");
    setPrice("");
    setTags("");
    setBusy(false);
    onAdded();
  };

  return (
    <div>
      <div className="add-product">
        <input
          className="auth-input"
          placeholder="Product title"
          value={title}
          maxLength={140}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <input
          className="auth-input"
          placeholder="Price (RM)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <input
          className="auth-input"
          placeholder="Tags (comma separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <button className="btn btn-primary" onClick={() => void add()} disabled={busy}>
          {busy ? "Adding…" : "Add product"}
        </button>
        {error && (
          <p role="alert" style={{ color: "var(--live-ink)", fontSize: 13.5, margin: 0 }}>
            {error}
          </p>
        )}
      </div>
      {products.length === 0 ? (
        <div className="section-note" style={{ marginTop: 14 }}>No products yet — add your first above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {products.map((p) => (
            <div key={p.id} className="seller-row">
              <div className="grow">
                <b>{p.title}</b>
                {p.variant && <span style={{ color: "var(--muted)", fontSize: 13 }}> · {p.variant}</span>}
              </div>
              <span className="card-price" style={{ fontSize: 14 }}>
                {formatRM(p.priceSen)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SellerOrders({ orders, onShipped }: { orders: SellerOrder[]; onShipped: () => void }) {
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);

  if (orders.length === 0) {
    return <div className="section-note" style={{ marginTop: 16 }}>No orders yet. Share your products to make your first sale.</div>;
  }

  const ship = async (orderId: string) => {
    if (shippingId) return;
    setShippingId(orderId);
    setShipError(null);
    const ok = await shipOrder(orderId);
    setShippingId(null);
    if (ok) onShipped();
    else setShipError("Couldn't mark that order shipped — try again.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
      {orders.map((o) => (
        <div key={o.orderId} className="seller-row">
          <div className="grow">
            <b>{formatRM(o.amountSen)}</b>
            <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
              {o.paymentStatus} · {o.fulfillmentStatus}
            </div>
          </div>
          {o.fulfillmentStatus === "unfulfilled" && (
            <button
              className="btn btn-ghost"
              style={{ padding: "8px 12px", fontSize: 13 }}
              onClick={() => void ship(o.orderId)}
              disabled={shippingId !== null}
            >
              {shippingId === o.orderId ? "Shipping…" : "Mark shipped"}
            </button>
          )}
        </div>
      ))}
      {shipError && (
        <p role="alert" style={{ color: "var(--live-ink)", fontSize: 13.5, margin: 0 }}>
          {shipError}
        </p>
      )}
    </div>
  );
}
