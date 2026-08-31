"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveRoom, Product, Video } from "@scopie/core";
import { VideoCard } from "./VideoCard";
import { LiveCard } from "./LiveCard";
import { CommentsSheet } from "./CommentsSheet";

/** One surface, typed cards: clips and live rooms share the same scroller. */
export type FeedEntry =
  | { kind: "video"; video: Video }
  | { kind: "live"; room: LiveRoom; poster: string };

interface Props {
  entries: FeedEntry[];
  products: Record<string, Product>;
  /** Deep link (?v=<id>): open the feed scrolled to this video. */
  initialVideoId?: string | null;
}

const entryId = (e: FeedEntry) => (e.kind === "video" ? e.video.id : `live:${e.room.id}`);

/**
 * Neighbour hint (reserved). Media NEVER attaches to non-active cards —
 * see VideoCard rule 2 (one pipeline at a time; parallel pipelines starve
 * budget-phone decoders). Preload-ahead will return via a single reused
 * player pool, not by widening this window.
 */
const NEAR = 1;

export function VideoFeed({ entries, products, initialVideoId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Seed the deep-linked index at FIRST render: card 0 must never flash
  // active (attaching media, logging a spurious view) before the jump.
  const [activeIndex, setActiveIndex] = useState(() => {
    if (!initialVideoId) return 0;
    const idx = entries.findIndex((e) => entryId(e) === initialVideoId || (e.kind === "video" && e.video.id === initialVideoId));
    return idx > 0 ? idx : 0;
  });
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<Video | null>(null);
  const [commentsVersion, setCommentsVersion] = useState(0);

  // Identity-stable handlers: VideoCard's media effects reference these, and
  // a fresh identity per render would tear the players down mid-scroll.
  const handleToggleMute = useCallback(() => setMuted((m) => !m), []);
  const handleForceMute = useCallback(() => setMuted(true), []);
  const handleOpenComments = useCallback((video: Video) => setCommentsFor(video), []);
  const handleCloseComments = useCallback(() => {
    setCommentsFor(null);
    setCommentsVersion((n) => n + 1); // cards re-read their local counts
  }, []);

  // Warm the hls.js chunk while the first card is still rendering, so the
  // download/parse (~188KB gzip, ~1s parse on budget CPUs) overlaps the
  // route paint instead of serializing after it.
  useEffect(() => {
    void import("hls.js").catch(() => undefined);
  }, []);

  // Remember the watched card: the feed scrolls an internal container, so
  // router scroll restoration can't help — Back from a creator page or live
  // room reads this to land on the same card instead of restarting at the top.
  useEffect(() => {
    try {
      const entry = entries[activeIndex];
      if (entry) sessionStorage.setItem("scopie_feed_at", entryId(entry));
    } catch {
      /* storage blocked — Back just lands at the top */
    }
  }, [activeIndex, entries]);

  // Deep link: the index is already seeded — this only moves the scroller.
  useEffect(() => {
    if (!initialVideoId) return;
    const idx = entries.findIndex((e) => entryId(e) === initialVideoId || (e.kind === "video" && e.video.id === initialVideoId));
    if (idx <= 0) return;
    const container = containerRef.current;
    const target = container?.children[idx] as HTMLElement | undefined;
    if (container && target) container.scrollTop = target.offsetTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideoId, entries.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = Array.from(container.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
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
  }, [entries.length]);

  return (
    <>
      <div className="feed" ref={containerRef}>
        {entries.map((entry, i) =>
          entry.kind === "live" ? (
            <LiveCard key={`live:${entry.room.id}`} room={entry.room} poster={entry.poster} />
          ) : (
            <VideoCard
              key={entry.video.id}
              video={entry.video}
              product={entry.video.productIds[0] ? products[entry.video.productIds[0]] : undefined}
              active={i === activeIndex}
              near={Math.abs(i - activeIndex) <= NEAR}
              muted={muted}
              commentsVersion={commentsVersion}
              onOpenComments={handleOpenComments}
              onToggleMute={handleToggleMute}
              onForceMute={handleForceMute}
            />
          ),
        )}
      </div>
      {commentsFor && <CommentsSheet video={commentsFor} onClose={handleCloseComments} />}
    </>
  );
}
