"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE, DEMO_MODE } from "@/lib/api";
import { useCommerce } from "@/components/commerce/Commerce";
import { useCart } from "@/lib/cart";
import { readScop, streakDays, type ScopEvent } from "@/lib/scop";
import { getAuthHeaders } from "@/lib/supabase";
import { useSession } from "@/lib/session";

function CartRow() {
  const cart = useCart();
  const { openCart } = useCommerce();
  return (
    <button className="btn btn-ghost" onClick={openCart}>
      Cart{cart.count > 0 ? ` · ${cart.count}` : ""}
    </button>
  );
}

/** Scopay: identity, credits, payments — in a panel over the surface. */
export function ProfilePanel() {
  const session = useSession();
  const [scop, setScop] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [ledger, setLedger] = useState<ScopEvent[]>([]);

  useEffect(() => {
    if (session.loading) return;
    if (DEMO_MODE) {
      // EARNED, not showcased: the local ledger is the balance (Rehearsal
      // tier — the wallet backend takes over from here).
      const store = readScop();
      setScop(store.balance);
      setLedger(store.ledger.slice(0, 6));
      setStreak(streakDays());
      return;
    }
    if (!session.userId && session.authEnabled) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/wallet/me`, {
          headers: await getAuthHeaders(),
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const w = (await res.json()) as { scopCredits: number };
          setScop(w.scopCredits);
        }
        // Non-ok (401/outage): leave scop null so it shows "—", never a false 0.
      } catch {
        // network error: keep unknown state
      }
    })();
  }, [session.loading, session.userId, session.authEnabled]);

  // Resolving the session — avoid a flash of fake signed-in UI.
  if (session.loading) {
    return (
      <div className="panel-pad" style={{ textAlign: "center", paddingTop: 100 }}>
        <div className="buffering" style={{ position: "static" }}>
          <div className="ring ring--ink"></div>
        </div>
      </div>
    );
  }

  // Signed out with real auth available: the profile is the sign-in door.
  if (session.authEnabled && !session.userId) {
    return (
      <div className="panel-pad" style={{ textAlign: "center", paddingTop: 60 }}>
        <h2 className="page-title">Your Scopie identity</h2>
        <p className="page-sub">Sign in to sync your credits, orders and picks across devices.</p>
        <Link href="/auth?next=%2F%3Fpanel%3Dprofile" className="btn btn-primary" style={{ width: "auto" }}>
          Sign in
        </Link>
      </div>
    );
  }

  const displayName = session.email ? session.email.split("@")[0] : "Zara";
  const isDemoIdentity = session.isGuest;

  return (
    <div className="panel-pad">
      {/* The card is the identity. Naming it three times above the card and
          the person twice inside it was the crowding. */}
      <div className="idcard">
        <div className="avatar-orb" aria-hidden="true">
          {(isDemoIdentity ? "Z" : displayName.charAt(0).toUpperCase()) || "S"}
        </div>
        <h2>{isDemoIdentity ? "Zara Tan" : displayName}</h2>
        <div className="scopid">
          {isDemoIdentity
            ? "SCOP-7G8H-2X9Q"
            : `SCOP-${(session.userId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()}`}
        </div>
        <div className="idcard-note">
          {isDemoIdentity ? "Guest preview — accounts open with the full launch" : session.email}
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="k">Scopie credits</div>
          <div className="v num">{scop === null ? "—" : `${scop} SCOP`}</div>
        </div>
        <div className="stat">
          <div className="k">Streak</div>
          <div className="v num">{streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "Start today"}</div>
        </div>
      </div>

      {ledger.length > 0 && (
        <>
          <h3 className="section-head">How you earned it</h3>
          <div className="scop-ledger">
            {ledger.map((e) => (
              <div key={e.key} className="scop-ledger-row">
                <span className="grow">{e.note}</span>
                <b className="num">+{e.pts}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="panel-actions">
        <Link href="/sell" className="btn btn-primary" style={{ width: "auto" }}>
          Seller Centre
        </Link>
        <CartRow />
      </div>

      {!isDemoIdentity && (
        <button className="btn btn-ghost" style={{ marginTop: 12, marginLeft: 10 }} onClick={() => void session.signOut()}>
          Sign out
        </button>
      )}

      <p className="section-note">
        Checkout takes FPX, DuitNow and e-wallets. SCOP credits are earned inside Scopie and redeemed for perks
        — they are not money and can&rsquo;t be cashed out.
      </p>
    </div>
  );
}
