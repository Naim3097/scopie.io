"use client";

import { useEffect, useState } from "react";
import type { Product } from "@scopie/core";
import { Brand } from "@/components/Brand";
import { ProductCard } from "@/components/ProductCard";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoProducts } from "@/lib/demo";

export default function DiscoverPage() {
  const [picks, setPicks] = useState<Product[]>([]);

  useEffect(() => {
    void apiGet<Product[]>("/v1/products/picks?limit=12", demoProducts).then((p) =>
      // Demo mode fills the grid with samples; a configured store that
      // answers 200 [] stays honestly empty (no phantom products).
      setPicks(DEMO_MODE && p.length === 0 ? demoProducts : p),
    );
  }, []);

  return (
    <main className="page page--pad">
      <div className="topbar" style={{ padding: 0 }}>
        <Brand />
      </div>
      <h1 className="page-title">Discover what&rsquo;s next, just for you.</h1>
      <p className="page-sub">Scopie AI scans trends, understands your style, and finds what you&rsquo;ll love.</p>
      <h2 style={{ fontSize: 17, margin: "6px 0 12px" }}>AI Picks For You</h2>
      {picks.length === 0 ? (
        <div className="section-note" style={{ marginTop: 0 }}>
          Sellers are stocking their shelves — check back soon for your first picks.
        </div>
      ) : (
        <div className="grid2">
          {picks.map((p) => (
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
