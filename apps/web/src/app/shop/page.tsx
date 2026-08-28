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
  const autoAskedRef = useRef(false);

  // Arriving from the discover AI-suggest card (?q=): the promise "I found
  // something for you" must carry over — ask it here automatically.
  useEffect(() => {
    if (autoAskedRef.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q?.trim()) {
      autoAskedRef.current = true;
      void send(q.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New turns must be visible — without this, replies + product grids land
  // below the fold and tapping Ask appears to do nothing.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [thread.length]);

  const send = async (given?: string) => {
    const text = (given ?? draft).trim();
    if (!text || busy) return;
    // Only clear the input when sending ITS contents — a starter chip must
    // not wipe a draft the user typed but hasn't sent.
    if (given === undefined) setDraft("");
    setBusy(true);
    setThread((t) => [...t, { role: "user", text }]);
    const found = demoSearch(text);
    const fallback = {
      reply: found.length > 0 ? "Here's what I found for you — tap one to see details." : EMPTY_REPLY,
      products: found,
    };
    const res = await apiPost<{ reply: string; products: Product[] }>(
      "/v1/agents/shopper",
      { message: text },
      fallback,
    );
    // Never promise results over an empty grid, whatever the source said.
    const reply = res.products.length === 0 && res.reply.toLowerCase().includes("found") ? EMPTY_REPLY : res.reply;
    setThread((t) => [...t, { role: "ai", text: reply, products: res.products }]);
    setBusy(false);
  };

  const starters = ["A tote bag for work", "White sneakers", "A watch under RM500", "A new perfume"];

  return (
    <main className="page page--pad">
      <div className="sec-label" style={{ marginTop: 14 }}>
        AI PERSONAL SHOPPER
      </div>
      <h1 className="page-title" style={{ marginTop: 2 }}>
        Hi, I&rsquo;m <span className="brand-name">Scopie</span>
      </h1>
      <p className="page-sub">Your AI Personal Shopper. I&rsquo;ll find the best for you.</p>

      <div className="thread" aria-live="polite">
        {thread.map((turn, i) => (
          <div key={i} style={{ display: "contents" }}>
            {turn.role === "ai" ? (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
                <span className="ai-orb ai-orb--sm" aria-hidden="true">
                  ✦
                </span>
                <div className="bubble bubble-ai">{turn.text}</div>
              </div>
            ) : (
              <div className="bubble bubble-user">{turn.text}</div>
            )}
            {turn.products && turn.products.length > 0 && (
              <div className="bubble-products">
                {turn.products.slice(0, 4).map((p) => (
                  <ProductCard key={p.id} product={p} surface="shop" />
                ))}
              </div>
            )}
          </div>
        ))}
        {/* scroll-margin keeps the newest reply clear of the floating dock */}
        <div ref={endRef} style={{ scrollMarginBottom: "calc(var(--nav-clear) + 16px)" }} />
      </div>

      {thread.length === 1 && (
        <div className="chips" role="group" aria-label="Suggestions">
          {starters.map((s) => (
            <button key={s} className="chip" onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

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
        Scopie can search and compare picks for you — but checkout always asks you to confirm. Your money never
        moves without your tap.
      </div>
    </main>
  );
}
