"use client";

import { useEffect, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { VideoFeed } from "@/components/feed/VideoFeed";
import { apiGet } from "@/lib/api";
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
      // An API that answers 200 [] must not strand users on a loading screen:
      // fall back to demo content until real content exists.
      setVideos(feed.length > 0 ? feed : demoVideos);
      setProducts(Object.fromEntries((picks.length > 0 ? picks : demoProducts).map((p) => [p.id, p])));
    })();
  }, []);

  return (
    <main className="page" style={{ paddingBottom: 0 }}>
      {videos.length > 0 ? (
        <VideoFeed videos={videos} products={products} />
      ) : (
        <div className="page--pad">
          <p className="page-sub" style={{ paddingTop: 40 }}>
            Loading your feed…
          </p>
        </div>
      )}
    </main>
  );
}
