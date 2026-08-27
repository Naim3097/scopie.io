"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { VideoCard } from "./VideoCard";

interface Props {
  videos: Video[];
  products: Record<string, Product>;
}

/**
 * Neighbour hint (reserved). Media NEVER attaches to non-active cards —
 * see VideoCard rule 2 (one pipeline at a time; parallel pipelines starve
 * budget-phone decoders). Preload-ahead will return via a single reused
 * player pool, not by widening this window.
 */
const NEAR = 1;

export function VideoFeed({ videos, products }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);

  // Identity-stable handlers: VideoCard's media effects reference these, and
  // a fresh identity per render would tear the players down mid-scroll.
  const handleToggleMute = useCallback(() => setMuted((m) => !m), []);
  const handleForceMute = useCallback(() => setMuted(true), []);

  // Warm the hls.js chunk while the first card is still rendering, so the
  // download/parse (~188KB gzip, ~1s parse on budget CPUs) overlaps the
  // route paint instead of serializing after it.
  useEffect(() => {
    void import("hls.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = Array.from(container.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = items.indexOf(entry.target as HTMLElement);
            if (idx >= 0) setActiveIndex(idx);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [videos.length]);

  return (
    <div className="feed" ref={containerRef}>
      {videos.map((video, i) => (
        <VideoCard
          key={video.id}
          video={video}
          product={video.productIds[0] ? products[video.productIds[0]] : undefined}
          active={i === activeIndex}
          near={Math.abs(i - activeIndex) <= NEAR}
          muted={muted}
          onToggleMute={handleToggleMute}
          onForceMute={handleForceMute}
        />
      ))}
    </div>
  );
}
