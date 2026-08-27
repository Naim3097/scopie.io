"use client";

import { useState } from "react";
import type { Product } from "@scopie/core";
import { ProductCard } from "@/components/ProductCard";
import { apiPost } from "@/lib/api";
import { demoProducts } from "@/lib/demo";

interface Turn {
  role: "user" | "ai";
  text: string;
  products?: Product[];
}

export default function ShopPage() {
  const [thread, setThread] = useState<Turn[]>([
    { role: "ai", text: "Hi, I'm Scopie ✨ Your AI personal shopper. What would you like to shop today?" },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setThread((t) => [...t, { role: "user", text }]);
    const q = text.toLowerCase();
    const fallback = {
      reply: "Here's what I found for you — tap one to see details.",
      products: demoProducts.filter(
        (p) => p.title.toLowerCase().includes(q) || p.tags.some((tag) => tag.includes(q)),
      ),
    };
    const res = await apiPost<{ reply: string; products: Product[] }>(
      "/v1/agents/shopper",
      { buyerId: "demo-buyer", message: text },
      fallback,
    );
    setThread((t) => [...t, { role: "ai", text: res.reply, products: res.products }]);
    setBusy(false);
  };

  return (
    <main className="page page--pad">
      <h1 className="page-title">
        Hi, I&rsquo;m <span style={{ color: "var(--cyan)" }}>Scopie</span>
      </h1>
      <p className="page-sub">Your AI Personal Shopper. I&rsquo;ll find the best for you.</p>

      <div className="thread">
        {thread.map((turn, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={`bubble ${turn.role === "user" ? "bubble-user" : "bubble-ai"}`}>{turn.text}</div>
            {turn.products && turn.products.length > 0 && (
              <div className="bubble-products">
                {turn.products.slice(0, 4).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="chatrow">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") void send();
          }}
          placeholder="Ask Scopie anything…"
          aria-label="Ask Scopie"
          disabled={busy}
        />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => void send()} disabled={busy}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
      <div className="section-note">
        Scopie can search, compare and fill your cart — but checkout always asks you to confirm. Your money never
        moves without your tap.
      </div>
    </main>
  );
}
