"use client";

import { useEffect, useRef, useState } from "react";
import type { Product, Video } from "@scopie/core";
import { VideoCard } from "./VideoCard";

interface Props {
  videos: Video[];
  products: Record<string, Product>;
}

/** Preload window: media attaches for active ± this many cards. */
const NEAR = 2;

export function VideoFeed({ videos, products }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);

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
          onToggleMute={() => setMuted((m) => !m)}
          onForceMute={() => setMuted(true)}
        />
      ))}
    </div>
  );
}
