"use client";

import Link from "next/link";
import type { LiveRoom } from "@scopie/core";
import { HelmetMark } from "@/components/Brand";
import { DEMO_MODE } from "@/lib/api";
import { useNow } from "@/lib/clock";
import { auctionState } from "@/lib/auction";
import { dropCycle } from "@/lib/drops";
import { giveawayState } from "@/lib/giveaway";
import { formatRM } from "@/lib/demo";

const compact = new Intl.NumberFormat("en-MY", { notation: "compact" });

/**
 * A live room as a feed card — live is part of the one surface, not a
 * separate section. Poster-only in the scroller (no stream pipeline here;
 * the room page owns the media); the whole card enters the room.
 * Liveness is a quiet violet pulse; the helmet chip is Scopie's AI identity
 * (full disclosure rides in the accessible name).
 */
export function LiveCard({ room, poster }: { room: LiveRoom; poster: string }) {
  // A coarse tick is enough to catch a window opening mid-scroll.
  // null until mounted — tags never render on the server (no hydration drift).
  const now = useNow(15_000);
  const drop = DEMO_MODE && now !== null ? dropCycle(room.id, now) : null;
  const dropLive = drop?.phase === "live" && !drop.soldOut;
  const auction = DEMO_MODE && now !== null ? auctionState(room.id, now) : null;
  const giveaway = DEMO_MODE && now !== null ? giveawayState(room.id, now) : null;
  return (
    <section className="feed-item" aria-label={`Live: ${room.title}`}>
      <Link href={`/live/${encodeURIComponent(room.id)}`} className="live-card">
        <img className="live-card-poster" src={poster} alt="" />
        <span className="live-card-top">
          <span className="live-chip" aria-label={`Live, ${room.viewerCount} watching`}>
            <span className="dot" aria-hidden="true" />
            Live · {compact.format(room.viewerCount)}
          </span>
          {dropLive && <span className="drop-tag">Drop · {drop.remaining} left</span>}
          {auction?.phase === "live" && <span className="drop-tag">Auction · {formatRM(auction.priceSen)}</span>}
          {giveaway?.phase === "open" && <span className="drop-tag">Giveaway 🎁</span>}
          {/* Simulated commerce is labeled, always — Whatnot's own term. */}
          {DEMO_MODE && <span className="rehearsal-chip">Rehearsal</span>}
        </span>
        <span className="live-card-info">
          {room.hostType === "ai" && (
            <span className="scopie-chip" aria-label="Hosted by Scopie AI — always disclosed">
              <HelmetMark size={15} />
              scopie
            </span>
          )}
          <b>{room.title}</b>
          <span className="live-card-cta">Join live ›</span>
        </span>
      </Link>
    </section>
  );
}
