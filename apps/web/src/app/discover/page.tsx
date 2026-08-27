"use client";

import { useEffect, useState } from "react";
import type { Product } from "@scopie/core";
import { ProductCard } from "@/components/ProductCard";
import { apiGet } from "@/lib/api";
import { demoProducts } from "@/lib/demo";

export default function DiscoverPage() {
  const [picks, setPicks] = useState<Product[]>([]);

  useEffect(() => {
    void apiGet<Product[]>("/v1/products/picks?limit=12", demoProducts).then((p) =>
      // 200 [] falls back to demo content — never an empty "AI Picks" grid.
      setPicks(p.length > 0 ? p : demoProducts),
    );
  }, []);

  return (
    <main className="page page--pad">
      <div className="topbar" style={{ padding: 0 }}>
        <span className="brand">
          <span className="b-cyan">scop</span>
          <span className="b-orange">ie</span>
        </span>
      </div>
      <h1 className="page-title">Discover what&rsquo;s next, just for you.</h1>
      <p className="page-sub">Scopie AI scans trends, understands your style, and finds what you&rsquo;ll love.</p>
      <h2 style={{ fontSize: 17, margin: "6px 0 12px" }}>AI Picks For You</h2>
      <div className="grid2">
        {picks.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      <div className="section-note">
        Match scores are personalised from your activity. The more you browse, the better they get.
      </div>
    </main>
  );
}
