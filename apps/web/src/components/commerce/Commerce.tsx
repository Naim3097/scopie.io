"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Product } from "@scopie/core";
import { API_BASE, DEMO_MODE } from "@/lib/api";
import { getAuthHeaders } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { useCart, MAX_QTY, type CartItem } from "@/lib/cart";
import { formatRM, sellerOf } from "@/lib/demo";
import { uuid4 } from "@/lib/identity";
import { StrokeIcon } from "@/components/Glyph";
import { flush, track } from "@/lib/events";

/**
 * The commerce surfaces: product sheet → cart → Scopie Pay confirmation.
 * Everything before the confirmation sheet is a proposal; the confirm tap
 * is the authorization (ARCHITECTURE.md · Agents). Sheets render in place
 * over the current page — the feed keeps playing underneath.
 */

export type Surface = "feed" | "discover" | "live" | "shop" | "profile" | "search";

type CheckoutOrigin = "cart" | "product" | "direct";

type SheetState =
  | { kind: "product"; product: Product; surface: Surface }
  | { kind: "cart" }
  | { kind: "checkout"; items: CartItem[]; from: CheckoutOrigin; product?: Product; surface?: Surface }
  | null;

interface CommerceApi {
  openProduct: (product: Product, surface: Surface) => void;
  openCart: () => void;
  buyNow: (product: Product, surface: Surface) => void;
}

const CommerceContext = createContext<CommerceApi | null>(null);

export function useCommerce(): CommerceApi {
  const ctx = useContext(CommerceContext);
  if (!ctx) throw new Error("useCommerce requires CommerceProvider");
  return ctx;
}

const FOCUSABLE = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cart = useCart();
  const pathname = usePathname();

  const openSheet = useCallback((next: NonNullable<SheetState>) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setSheet(next);
  }, []);

  const openProduct = useCallback(
    (product: Product, surface: Surface) => {
      track({ type: "product.view", subjectId: product.id, surface, meta: { sheet: true } });
      openSheet({ kind: "product", product, surface });
    },
    [openSheet],
  );

  const openCart = useCallback(() => openSheet({ kind: "cart" }), [openSheet]);

  const buyNow = useCallback(
    (product: Product, surface: Surface) => {
      track({ type: "product.view", subjectId: product.id, surface, meta: { buyNow: true } });
      openSheet({ kind: "checkout", items: [{ product, qty: 1 }], from: "direct" });
    },
    [openSheet],
  );

  // Close mirrors open: play the exit (200ms covers both keyframes), THEN
  // unmount — sheets must never vanish in a single frame.
  const close = useCallback(() => {
    if (closeTimerRef.current) return; // already closing
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      setSheet(null);
    }, 200);
  }, []);

  // Navigating anywhere closes any open sheet instantly — a sign-in page
  // must never render underneath a modal.
  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setSheet(null);
  }, [pathname]);

  // The system back gesture closes an open sheet instead of leaving the page
  // — the strongest "real app" tell on Android. One history entry per sheet
  // session; programmatic closes consume it, so history stays balanced.
  const sheetOpen = sheet !== null;
  useEffect(() => {
    if (!sheetOpen) return;
    let popped = false;
    window.history.pushState({ scopieSheet: true }, "");
    const onPop = () => {
      popped = true;
      close();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Only unwind OUR entry — after a route change the top of the stack
      // belongs to the router, and going back would undo the navigation.
      if (!popped && (window.history.state as { scopieSheet?: boolean } | null)?.scopieSheet) {
        window.history.back();
      }
    };
  }, [sheetOpen, close]);

  // Scroll lock + ESC + focus + a Tab trap while any sheet is open —
  // aria-modal promises the background is inert, so the keyboard must agree.
  useEffect(() => {
    if (!sheet) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusables = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => !el.hasAttribute("disabled"),
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === sheetRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (active && !sheetRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [sheet, close]);

  // Stable context value — every feed card subscribes to this.
  const api = useMemo<CommerceApi>(() => ({ openProduct, openCart, buyNow }), [openProduct, openCart, buyNow]);

  return (
    <CommerceContext.Provider value={api}>
      {children}
      {sheet && (
        <div className={`sheet-backdrop${closing ? " closing" : ""}`} onClick={close}>
          <div
            ref={sheetRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              sheet.kind === "product" ? sheet.product.title : sheet.kind === "cart" ? "Your cart" : "Confirm and pay"
            }
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            {sheet.kind === "product" && (
              <ProductSheet
                product={sheet.product}
                onAdd={(qty) => {
                  const ok = cart.add(sheet.product, qty);
                  if (ok) {
                    track({
                      type: "product.add_to_cart",
                      subjectId: sheet.product.id,
                      surface: sheet.surface,
                      meta: { qty },
                    });
                  }
                  return ok;
                }}
                onBuy={(qty) =>
                  setSheet({
                    kind: "checkout",
                    items: [{ product: sheet.product, qty }],
                    from: "product",
                    product: sheet.product,
                    surface: sheet.surface,
                  })
                }
                onViewCart={openCart}
              />
            )}
            {sheet.kind === "cart" && (
              <CartSheet
                onCheckout={() => setSheet({ kind: "checkout", items: cart.items, from: "cart" })}
                onBrowse={close}
              />
            )}
            {sheet.kind === "checkout" && (
              <CheckoutSheet
                items={sheet.items}
                fromCart={sheet.from === "cart"}
                onClose={close}
                onBack={
                  sheet.from === "cart"
                    ? openCart
                    : sheet.from === "product" && sheet.product
                      ? () => openProduct(sheet.product!, sheet.surface ?? "discover")
                      : close
                }
              />
            )}
            <button className="sheet-close" onClick={close} aria-label="Close">
              <StrokeIcon kind="cross" size={16} />
            </button>
          </div>
        </div>
      )}
    </CommerceContext.Provider>
  );
}

/* ── product sheet ─────────────────────────────────────────────────── */

function ProductSheet({
  product,
  onAdd,
  onBuy,
  onViewCart,
}: {
  product: Product;
  onAdd: (qty: number) => boolean;
  onBuy: (qty: number) => void;
  onViewCart: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<"added" | "full" | null>(null);
  const seller = sellerOf(product);

  return (
    <div>
      {product.imageUrl && <img className="sheet-img" src={product.imageUrl} alt={product.title} />}
      <div className="sheet-body">
        {typeof product.matchScore === "number" && (
          <span className="match">
            <span aria-hidden="true">✦</span> {product.matchScore}% Match
          </span>
        )}
        <h2 style={{ fontSize: 21 }}>{product.title}</h2>
        {product.variant && <div className="card-variant" style={{ fontSize: 14 }}>{product.variant}</div>}
        {seller && (
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
            by <b>{seller.name}</b>
            {seller.verified && (
              <span style={{ color: "var(--accent)" }} aria-label="Verified seller">
                {" "}
                ✓
              </span>
            )}{" "}
            · {seller.tagline}
          </div>
        )}
        <div className="sheet-price">{product.enquiryOnly ? "Price on request" : formatRM(product.priceSen)}</div>
        {product.tags.length > 0 && (
          <div className="chips" style={{ marginBottom: 4 }} aria-hidden="true">
            {product.tags.slice(0, 5).map((t) => (
              <span key={t} className="chip" style={{ pointerEvents: "none" }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {product.enquiryOnly ? (
          // B2B / regulated services: no invented figures, no cart — the
          // seller quotes directly. Ask Scopie can explain the offering.
          <p className="sheet-note" style={{ marginTop: 12 }}>
            This is a quote-based offering — the seller confirms pricing and terms directly. Ask Scopie about it
            from the feed, or follow the seller for updates.
          </p>
        ) : (
          <>
            <div className="sheet-row" style={{ marginTop: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>Quantity</span>
              <QtyStepper
                qty={qty}
                onChange={(n) => setQty(Math.min(MAX_QTY, Math.max(1, n)))}
                label={product.title}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  const ok = onAdd(qty);
                  setFeedback(ok ? "added" : "full");
                  setTimeout(() => setFeedback(null), 1800);
                }}
              >
                {feedback === "added" ? "Added ✓" : "Add to cart"}
              </button>
              <button className="btn btn-primary" style={{ flex: 1, width: "auto" }} onClick={() => onBuy(qty)}>
                Buy now
              </button>
            </div>
            {feedback === "full" && (
              <p role="alert" className="sheet-note" style={{ color: "var(--live-ink)" }}>
                Your cart is full — remove something first.
              </p>
            )}
            {feedback === "added" && (
              <button className="sheet-link" onClick={onViewCart}>
                View cart →
              </button>
            )}
            <p className="sheet-note">Buyer-protected: your payment is held until the order is delivered.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── cart sheet ────────────────────────────────────────────────────── */

function CartSheet({ onCheckout, onBrowse }: { onCheckout: () => void; onBrowse: () => void }) {
  const cart = useCart();

  if (cart.items.length === 0) {
    return (
      <div className="sheet-body" style={{ textAlign: "center", paddingTop: 26 }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 10, color: "var(--accent)" }}>
          <StrokeIcon kind="cart" size={40} />
        </div>
        <h2 style={{ fontSize: 20 }}>Your cart is empty</h2>
        <p className="page-sub" style={{ marginBottom: 16 }}>
          Anything you add from the feed, live shows or Discover lands here.
        </p>
        <button className="btn btn-primary" onClick={onBrowse}>
          Keep browsing
        </button>
      </div>
    );
  }

  return (
    <div className="sheet-body">
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>Your cart</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cart.items.map(({ product, qty }) => (
          <div key={product.id} className="cart-line">
            {product.imageUrl && <img src={product.imageUrl} alt="" />}
            <div className="grow">
              <b>{product.title}</b>
              <div className="cart-line-price">{formatRM(product.priceSen)}</div>
              <QtyStepper qty={qty} onChange={(n) => cart.setQty(product.id, n)} label={product.title} small />
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <button className="cart-remove" onClick={() => cart.remove(product.id)} aria-label={`Remove ${product.title}`}>
                <StrokeIcon kind="cross" size={14} />
              </button>
              <span className="card-price" style={{ fontSize: 14.5 }}>
                {formatRM(product.priceSen * qty)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="sheet-total">
        <span>Total</span>
        <b>{formatRM(cart.totalSen)}</b>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={onCheckout}>
        Checkout · {formatRM(cart.totalSen)}
      </button>
      <p className="sheet-note">Nothing is charged yet — you confirm on the next step.</p>
    </div>
  );
}

/* ── Scopie Pay confirmation sheet ─────────────────────────────────── */

function CheckoutSheet({
  items,
  fromCart,
  onBack,
  onClose,
}: {
  items: CartItem[];
  fromCart: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const cart = useCart();
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // Local copy: the server-echoed price can correct a stale snapshot.
  const [lines, setLines] = useState(items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dismissing checkout must cancel an in-flight confirm — the page must
  // never be yanked to the gateway after the user closed the sheet.
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const totalSen = lines.reduce((n, i) => n + i.product.priceSen * i.qty, 0);
  // The payments API takes one product per order; multi-line real checkout
  // arrives with the commerce backend.
  const realBlocked = !DEMO_MODE && lines.length > 1;

  const confirm = async () => {
    if (busy || lines.length === 0 || session.loading) return;
    // Signed-out users confirm after signing in — the tap stays theirs.
    if (session.authEnabled && !session.userId) {
      onClose();
      router.push(`/auth?next=${encodeURIComponent(pathname ?? "/discover")}`);
      return;
    }
    setBusy(true);
    setError(null);
    const orderId = uuid4();

    if (DEMO_MODE) {
      // The cart clears on the return page (from_cart=1) — never before the
      // success screen actually exists. Client navigation: a full document
      // reload at the payment moment is the most jarring cut in the app.
      router.push(`/pay/return?demo_paid=1&order=${orderId}${fromCart ? "&from_cart=1" : ""}`);
      return;
    }
    try {
      await flush(); // don't lose intent events to the redirect
      const line = lines[0]!;
      const returnParams = fromCart ? `&pline=${encodeURIComponent(line.product.id)}` : "";
      const returnUrl = `${window.location.origin}/pay/return?order=${orderId}${returnParams}`;
      const res = await fetch(`${API_BASE}/v1/payments/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({ orderId, productId: line.product.id, quantity: line.qty, returnUrl }),
        signal: AbortSignal.timeout(8000),
      });
      if (!activeRef.current) return;
      if (res.status === 401) {
        onClose();
        router.push(`/auth?next=${encodeURIComponent(pathname ?? "/discover")}`);
        return;
      }
      if (!res.ok) {
        setError("Checkout couldn't start. Please try again.");
        setBusy(false);
        return;
      }
      const { paymentUrl, amountSen } = (await res.json()) as { paymentUrl?: unknown; amountSen?: unknown };
      if (!activeRef.current) return;
      // The confirm tap authorizes a NUMBER. If the server-derived charge
      // differs from what was displayed, show the real price and re-ask.
      if (typeof amountSen === "number" && amountSen !== totalSen) {
        setLines([{ ...line, product: { ...line.product, priceSen: Math.round(amountSen / Math.max(1, line.qty)) } }]);
        setError(`The price changed — it's now ${formatRM(amountSen)}. Review and confirm again.`);
        setBusy(false);
        return;
      }
      if (typeof paymentUrl !== "string" || !/^https?:\/\//.test(paymentUrl)) {
        setError("Checkout couldn't start. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = paymentUrl;
    } catch {
      if (!activeRef.current) return;
      // A configured-but-unreachable API is an OUTAGE, not demo mode.
      setError("Checkout couldn't start — please check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="sheet-body">
      <div className="sec-label">SCOPIE PAY</div>
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>Confirm &amp; pay</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map(({ product, qty }) => (
          <div key={product.id} className="sheet-row">
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {product.title} {qty > 1 ? `× ${qty}` : ""}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              {formatRM(product.priceSen * qty)}
            </span>
          </div>
        ))}
      </div>
      <div className="sheet-total">
        <span>Total</span>
        <b>{formatRM(totalSen)}</b>
      </div>

      <div className="sheet-row" style={{ marginTop: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>Pay with</span>
        <span style={{ color: "var(--muted)", fontSize: 13.5 }}>FPX · DuitNow · e-wallets</span>
      </div>

      {realBlocked ? (
        <p className="sheet-note" role="alert" style={{ marginTop: 12 }}>
          One order at a time for now — remove extra items, or check out each one separately. Multi-item checkout
          arrives with the commerce backend.
        </p>
      ) : (
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={() => void confirm()}
          disabled={busy || session.loading}
        >
          {busy ? "Opening your bank…" : `Confirm & Pay ${formatRM(totalSen)}`}
        </button>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--live-ink)", fontSize: 13.5, marginTop: 8 }}>
          {error}
        </p>
      )}
      <p className="sheet-note">
        {DEMO_MODE
          ? "Demo checkout — no money moves. The real flow opens your bank or e-wallet."
          : "You'll approve this payment in your bank or e-wallet — no money moves until then."}
      </p>
      <button className="sheet-link" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}

/* ── shared bits ───────────────────────────────────────────────────── */

function QtyStepper({
  qty,
  onChange,
  label,
  small,
}: {
  qty: number;
  onChange: (n: number) => void;
  label: string;
  small?: boolean;
}) {
  const size = small ? 28 : 34;
  return (
    <span className="qty-stepper" style={{ gap: small ? 8 : 12 }}>
      <button
        style={{ width: size, height: size }}
        onClick={() => onChange(qty - 1)}
        aria-label={`Decrease quantity of ${label}`}
      >
        −
      </button>
      <span aria-live="polite" style={{ minWidth: 16, textAlign: "center", fontWeight: 800 }}>
        {qty}
      </span>
      <button
        style={{ width: size, height: size }}
        onClick={() => onChange(qty + 1)}
        aria-label={`Increase quantity of ${label}`}
      >
        +
      </button>
    </span>
  );
}

/** Cart button with count badge — lives in page topbars. */
export function CartButton() {
  const cart = useCart();
  const { openCart } = useCommerce();
  return (
    <button className="cart-btn" onClick={openCart} aria-label={`Cart, ${cart.count} items`}>
      <StrokeIcon kind="cart" size={22} />
      {cart.count > 0 && <span className="cart-count">{cart.count > 9 ? "9+" : cart.count}</span>}
    </button>
  );
}
