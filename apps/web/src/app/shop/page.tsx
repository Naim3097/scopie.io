"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@scopie/core";
import { ProductCard } from "@/components/ProductCard";
import { apiPost } from "@/lib/api";
import { demoProducts } from "@/lib/demo";

interface Turn {
  role: "user" | "ai";
  text: string;
  products?: Product[];
}

/** Word-level match so "running shoes" finds the runner, not nothing. */
function demoSearch(query: string): Product[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return [];
  return demoProducts.filter((p) =>
    words.some(
      (w) =>
        p.title.toLowerCase().includes(w) ||
        (p.variant ?? "").toLowerCase().includes(w) ||
        p.tags.some((tag) => tag.includes(w) || w.includes(tag)),
    ),
  );
}

const EMPTY_REPLY =
  "I couldn't find a match for that yet — our demo catalog is small. Try “bag”, “shoes”, “watch” or “perfume”.";

export default function ShopPage() {
  const [thread, setThread] = useState<Turn[]>([
    { role: "ai", text: "Hi, I'm Scopie ✨ Your AI personal shopper. What would you like to shop today?" },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // New turns must be visible — without this, replies + product grids land
  // below the fold and tapping Ask appears to do nothing.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setThread((t) => [...t, { role: "user", text }]);
    const found = demoSearch(text);
    const fallback = {
      reply: found.length > 0 ? "Here's what I found for you — tap one to see details." : EMPTY_REPLY,
      products: found,
    };
    const res = await apiPost<{ reply: string; products: Product[] }>(
      "/v1/agents/shopper",
      { buyerId: "demo-buyer", message: text },
      fallback,
    );
    // Never promise results over an empty grid, whatever the source said.
    const reply = res.products.length === 0 && res.reply.toLowerCase().includes("found") ? EMPTY_REPLY : res.reply;
    setThread((t) => [...t, { role: "ai", text: reply, products: res.products }]);
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
        <div ref={endRef} />
      </div>

      <div className="chatrow">
        {/* Input stays enabled while busy: disabling a focused input closes
            the mobile keyboard on every send. send() itself guards on busy. */}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") void send();
          }}
          placeholder="Ask Scopie anything…"
          aria-label="Ask Scopie"
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
