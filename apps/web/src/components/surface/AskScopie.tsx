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
  "I couldn't find a match for that one — try “kaftan”, “kurta”, “perfume”, “burger”, “houseboat” or “motor”.";

/**
 * The AI personal shopper — Scopie's intent path. Lives in a panel over the
 * surface, never a separate page: discovery is the feed, intent is this.
 */
export function AskScopie({ initialQuery }: { initialQuery?: string | null }) {
  const [thread, setThread] = useState<Turn[]>([
    { role: "ai", text: "Tell me what you're after and I'll find it — by name, by occasion, or by budget." },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const autoAskedRef = useRef(false);

  // Arriving from a search-panel suggestion or an old /shop?q= link: the
  // promise "I found something for you" must carry over — ask it here.
  useEffect(() => {
    if (autoAskedRef.current) return;
    if (initialQuery?.trim()) {
      autoAskedRef.current = true;
      void send(initialQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

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

  const starters = ["A batik kaftan for raya", "A perfume under RM50", "Smash burgers near me", "A houseboat trip for the family"];

  return (
    <div className="panel-pad">
      {/* The panel header already says "Ask Scopie" and the first message
          introduces the host. Saying it four times before the user can type
          was the crowding, not the content. */}
      <div className="thread" aria-live="polite">
        {thread.map((turn, i) => (
          <div key={i} style={{ display: "contents" }}>
            {turn.role === "ai" ? (
              <div className="thread-ai">
                <span className="ai-orb ai-orb--sm" aria-hidden="true">
                  S
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
        <div ref={endRef} style={{ scrollMarginBottom: 16 }} />
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
          placeholder="What are you looking for?"
          aria-label="Ask Scopie"
        />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => void send()} disabled={busy}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
      <p className="section-note">
        Scopie is an AI assistant. Checkout always asks you to confirm — money never moves without your tap.
      </p>
    </div>
  );
}
