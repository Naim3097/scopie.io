"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export default function ProfilePage() {
  const [scop, setScop] = useState<number | null>(null);

  useEffect(() => {
    void apiGet<{ scopCredits: number }>("/v1/wallet/demo-buyer", { scopCredits: 1250 }).then((w) =>
      setScop(w.scopCredits),
    );
  }, []);

  return (
    <main className="page page--pad">
      <h1 className="page-title">
        Hi, I&rsquo;m <span style={{ color: "var(--cyan)" }}>Zara</span>
      </h1>
      <p className="page-sub">This is your digital identity, powered by Scopie.</p>

      <div className="idcard">
        <div className="verified">✓ VERIFIED</div>
        <h2>Zara Tan</h2>
        <div className="scopid">SCOP-7G8H-2X9Q</div>
        <div style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 6 }}>Member since May 2024</div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="k">Scopie Credits</div>
          <div className="v">{scop ?? "—"} SCOP</div>
        </div>
        <div className="stat">
          <div className="k">Payments</div>
          <div className="v" style={{ fontSize: 15, fontWeight: 600 }}>
            FPX · DuitNow · e-wallets
          </div>
        </div>
      </div>

      <div className="section-note">
        SCOP credits are earned through activity and redeemed for perks inside Scopie — they are not money and
        can&rsquo;t be cashed out. Purchases are paid directly through your bank or e-wallet at checkout.
      </div>
    </main>
  );
}
