"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Product } from "@scopie/core";
import { Brand } from "@/components/Brand";
import { CartButton } from "@/components/commerce/Commerce";
import { StrokeIcon } from "@/components/Glyph";
import { ProductCard } from "@/components/ProductCard";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoProducts, formatRM } from "@/lib/demo";

type Sort = "trending" | "foryou";

export default function DiscoverPage() {
  const [picks, setPicks] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>("trending");

  useEffect(() => {
    void apiGet<Product[]>("/v1/products/picks?limit=12", demoProducts).then((p) => {
      // Demo mode fills the grid with samples; a configured store that
      // answers 200 [] stays honestly empty (no phantom products).
      setPicks(DEMO_MODE && p.length === 0 ? demoProducts : p);
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
    <main className="page page--pad">
      <div className="topbar" style={{ padding: 0 }}>
        <Brand />
        <CartButton />
      </div>
      <h1 className="page-title">Discover what&rsquo;s next, just for you.</h1>
      <p className="page-sub">Scopie AI scans trends, understands your style, and finds what you&rsquo;ll love.</p>

      {/* Conversational entry — hands off to the AI personal shopper. */}
      <Link href="/shop" className="searchbar">
        <StrokeIcon kind="discover" size={18} />
        <span className="searchbar-hint">Tell me what you&rsquo;re looking for…</span>
        <span className="searchbar-spark">
          <StrokeIcon kind="spark" size={17} />
        </span>
      </Link>

      <div className="chips" role="group" aria-label="Explore">
        <button className={`chip${sort === "trending" ? " chip-on" : ""}`} aria-pressed={sort === "trending"} onClick={() => setSort("trending")}>
          <StrokeIcon kind="spark" size={13} /> Trending
        </button>
        <button className={`chip${sort === "foryou" ? " chip-on" : ""}`} aria-pressed={sort === "foryou"} onClick={() => setSort("foryou")}>
          For You
        </button>
        <Link href="/live" className="chip">
          Live <span aria-hidden="true">›</span>
        </Link>
        <Link href="/shop" className="chip">
          Ask Scopie <span aria-hidden="true">›</span>
        </Link>
      </div>

      {aiPick && (
        <Link href={`/shop?q=${encodeURIComponent(aiPick.title)}`} className="ai-suggest">
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
        </Link>
      )}

      <div className="sec-label">FOR YOU</div>
      <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>AI Picks</h2>
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
    </main>
  );
}
