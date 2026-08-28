"use client";

import { useEffect, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { VideoFeed } from "@/components/feed/VideoFeed";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { demoProducts, demoVideos } from "@/lib/demo";

export default function FeedPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});

  useEffect(() => {
    void (async () => {
      const [feed, picks] = await Promise.all([
        apiGet<Video[]>("/v1/feed", demoVideos),
        apiGet<Product[]>("/v1/products/picks?limit=20", demoProducts),
      ]);
      // The server owns cold-start behavior (it returns stripped demo videos
      // for a configured-but-empty store); the client only guards the pure
      // network-failure case its apiGet fallback already covers.
      let merged = feed.length > 0 ? feed : demoVideos;
      // Pure-demo site ONLY: locally "created" posts lead the feed. Never
      // against a real API — stale local entries must not sit atop real
      // content.
      if (DEMO_MODE) {
        try {
          const raw = JSON.parse(localStorage.getItem("scopie_demo_myvideos") ?? "[]") as unknown;
          const mine = Array.isArray(raw) ? raw : [];
          if (mine.length > 0) {
            const local: Video[] = mine.slice(0, 3).map((m, i) => ({
              id: `local_${Number((m as { at?: unknown })?.at) || i}_${i}`,
              creatorId: "you",
              caption: String((m as { caption?: unknown })?.caption ?? ""),
              hlsUrl: demoVideos[0]!.hlsUrl,
              posterUrl: "/posters/poster-a.png",
              hashtags: ["MyFirstScopie"],
              productIds: [],
              stats: { likes: 0, comments: 0, shares: 0 },
            }));
            merged = [...local, ...merged];
          }
        } catch {
          /* localStorage unavailable/corrupt — skip */
        }
      }
      setVideos(merged);
      // Trust the API's product list as returned: a configured store that
      // answers 200 [] stays empty (demo products must not resurrect).
      const productList = DEMO_MODE || picks.length > 0 ? (picks.length > 0 ? picks : demoProducts) : picks;
      setProducts(Object.fromEntries(productList.map((p) => [p.id, p])));
    })();
  }, []);

  return (
    <main className="page page--feed" style={{ position: "relative" }}>
      <h1 className="sr-only">Feed</h1>
      <span className="feed-brand" aria-hidden="true">
        scopie
      </span>
      {videos.length > 0 ? (
        <VideoFeed videos={videos} products={products} />
      ) : (
        <div className="page--pad">
          {/* light-token .page-sub would vanish on the dark feed ground */}
          <p role="status" style={{ paddingTop: 40, color: "rgba(255, 255, 255, 0.78)", fontSize: 14.5 }}>
            Loading your feed…
          </p>
        </div>
      )}
    </main>
  );
}
