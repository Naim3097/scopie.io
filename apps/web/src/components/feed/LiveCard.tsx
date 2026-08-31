"use client";

import Link from "next/link";
import type { LiveRoom } from "@scopie/core";

const compact = new Intl.NumberFormat("en-MY", { notation: "compact" });

/**
 * A live room as a feed card — live is part of the one surface, not a
 * separate section. Poster-only in the scroller (no stream pipeline here;
 * the room page owns the media); the whole card enters the room.
 */
export function LiveCard({ room, poster }: { room: LiveRoom; poster: string }) {
  return (
    <section className="feed-item" aria-label={`Live: ${room.title}`}>
      <Link href={`/live/${encodeURIComponent(room.id)}`} className="live-card">
        <img className="live-card-poster" src={poster} alt="" />
        <span className="live-card-top">
          <span className="live-badge">
            <span aria-hidden="true">●</span> LIVE
          </span>
          <span className="live-card-viewers">
            <span aria-hidden="true">✦</span> {compact.format(room.viewerCount)} watching
          </span>
        </span>
        <span className="live-card-info">
          {room.hostType === "ai" && (
            <span className="ai-badge">
              <span aria-hidden="true">✦</span> AI Host
            </span>
          )}
          <b>{room.title}</b>
          <span className="live-card-cta">Join live ›</span>
        </span>
      </Link>
    </section>
  );
}
