"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE, DEMO_MODE } from "@/lib/api";
import { getAuthHeaders } from "@/lib/supabase";
import { useSession } from "@/lib/session";

export default function ProfilePage() {
  const session = useSession();
  const [scop, setScop] = useState<number | null>(null);

  useEffect(() => {
    if (session.loading) return;
    if (DEMO_MODE) {
      setScop(1250); // demo showcase value
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
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 100 }}>
        <div className="buffering" style={{ position: "static" }}>
          <div className="ring" style={{ borderTopColor: "var(--accent)", borderColor: "var(--line-strong)" }}></div>
        </div>
      </main>
    );
  }

  // Signed out with real auth available: the profile is the sign-in door.
  if (session.authEnabled && !session.userId) {
    return (
      <main className="page page--pad" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48 }}>👤</div>
        <h1 className="page-title">Your Scopie identity</h1>
        <p className="page-sub">Sign in to sync your credits, orders and picks across devices.</p>
        <Link href="/auth?next=/profile" className="btn btn-primary" style={{ width: "auto" }}>
          Sign in
        </Link>
      </main>
    );
  }

  const displayName = session.email ? session.email.split("@")[0] : "Zara";
  const isDemoIdentity = session.isGuest;

  return (
    <main className="page page--pad">
      <h1 className="page-title">
        Hi, I&rsquo;m <span style={{ color: "var(--cyan)" }}>{isDemoIdentity ? "Zara" : displayName}</span>
      </h1>
      <p className="page-sub">This is your digital identity, powered by Scopie.</p>

      <div className="idcard">
        <div className="verified">{isDemoIdentity ? "◌ GUEST PREVIEW" : "✓ SIGNED IN"}</div>
        <h2>{isDemoIdentity ? "Zara Tan" : displayName}</h2>
        <div className="scopid">
          {isDemoIdentity
            ? "SCOP-7G8H-2X9Q"
            : `SCOP-${(session.userId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()}`}
        </div>
        <div style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 6 }}>
          {isDemoIdentity ? "Demo identity — accounts open with the full launch" : session.email}
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="k">Scopie Credits</div>
          <div className="v">{scop === null ? "—" : `${scop} SCOP`}</div>
        </div>
        <div className="stat">
          <div className="k">Payments</div>
          <div className="v" style={{ fontSize: 15, fontWeight: 600 }}>
            FPX · DuitNow · e-wallets
          </div>
        </div>
      </div>

      <Link href="/sell" className="btn btn-primary" style={{ marginTop: 16, width: "auto" }}>
        🛒 Seller Centre
      </Link>

      {!isDemoIdentity && (
        <button className="btn btn-ghost" style={{ marginTop: 12, marginLeft: 10 }} onClick={() => void session.signOut()}>
          Sign out
        </button>
      )}

      <div className="section-note">
        SCOP credits are earned through activity and redeemed for perks inside Scopie — they are not money and
        can&rsquo;t be cashed out. Purchases are paid directly through your bank or e-wallet at checkout.
      </div>
    </main>
  );
}
