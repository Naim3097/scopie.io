"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@scopie/core";
import { StrokeIcon } from "@/components/Glyph";
import { ProductCard } from "@/components/ProductCard";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoProducts, formatRM } from "@/lib/demo";

type Sort = "trending" | "foryou";

/**
 * Discovery-with-intent: the browse grid, in a panel over the surface.
 * Conversational queries hand off to the Ask Scopie panel (onAsk).
 */
export function SearchPanel({ onAsk }: { onAsk: (query?: string) => void }) {
  // Demo picks seed synchronously — no spinner frame on open.
  const [picks, setPicks] = useState<Product[]>(() => (DEMO_MODE ? demoProducts : []));
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [sort, setSort] = useState<Sort>("trending");

  useEffect(() => {
    if (DEMO_MODE) return;
    void apiGet<Product[]>("/v1/products/picks?limit=12", demoProducts).then((p) => {
      // A configured store that answers 200 [] stays honestly empty.
      setPicks(p);
      setLoading(false);
    });
  }, []);

  const shown = useMemo(() => {
    if (sort === "foryou") {
      return [...picks].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    }
    return picks;
  }, [picks, sort]);

  // The AI moment: surface the single best match as a personal suggestion.
  const aiPick = useMemo(() => {
    if (picks.length === 0) return null;
    return [...picks].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))[0] ?? null;
  }, [picks]);

  return (
    <div className="panel-pad">
      <h2 className="page-title" style={{ marginTop: 6 }}>
        Discover what&rsquo;s next, just for you.
      </h2>
      <p className="page-sub">Scopie AI scans trends, understands your style, and finds what you&rsquo;ll love.</p>

      {/* Conversational entry — hands off to the AI personal shopper. */}
      <button className="searchbar" style={{ width: "100%" }} onClick={() => onAsk()}>
        <StrokeIcon kind="discover" size={18} />
        <span className="searchbar-hint">Tell me what you&rsquo;re looking for…</span>
        <span className="searchbar-spark">
          <StrokeIcon kind="spark" size={17} />
        </span>
      </button>

      <div className="chips" role="group" aria-label="Explore">
        <button className={`chip${sort === "trending" ? " chip-on" : ""}`} aria-pressed={sort === "trending"} onClick={() => setSort("trending")}>
          <StrokeIcon kind="spark" size={13} /> Trending
        </button>
        <button className={`chip${sort === "foryou" ? " chip-on" : ""}`} aria-pressed={sort === "foryou"} onClick={() => setSort("foryou")}>
          For You
        </button>
        <button className="chip" onClick={() => onAsk()}>
          Ask Scopie <span aria-hidden="true">›</span>
        </button>
      </div>

      {aiPick && (
        <button className="ai-suggest" style={{ width: "100%", textAlign: "left" }} onClick={() => onAsk(aiPick.title)}>
          <span className="ai-orb" aria-hidden="true">
            AI
          </span>
          <span className="grow">
            <b>I found something perfect for you…</b>
            <span className="sub">
              {aiPick.title} · {formatRM(aiPick.priceSen)}
              {typeof aiPick.matchScore === "number" && (
                <>
                  {" · "}
                  <span aria-hidden="true">✦ </span>
                  {aiPick.matchScore}% match
                </>
              )}
            </span>
          </span>
          {aiPick.imageUrl && <img src={aiPick.imageUrl} alt="" />}
        </button>
      )}

      <div className="sec-label">FOR YOU</div>
      <h3 style={{ fontSize: 18, margin: "0 0 12px" }}>AI Picks</h3>
      {loading ? (
        <div className="buffering" style={{ position: "static", padding: "30px 0" }} role="status" aria-label="Loading picks">
          <div className="ring" style={{ borderTopColor: "var(--accent)", borderColor: "var(--line-strong)" }}></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="section-note" style={{ marginTop: 0 }}>
          Sellers are stocking their shelves — check back soon for your first picks.
        </div>
      ) : (
        <div className="grid2">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
      <div className="section-note">
        Match scores are personalised from your activity. The more you browse, the better they get.
      </div>
    </div>
  );
}
