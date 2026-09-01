"use client";

import { useEffect, useRef } from "react";
import type { Product } from "@scopie/core";
import { useNow, countdownTo, formatCountdown } from "@/lib/clock";
import { formatRM } from "@/lib/demo";
import { claimDrop, dropCycle, toastName, type DropClaim, type DropCycle, type DropPhase } from "@/lib/drops";

/**
 * The in-room flash drop — TikTok Shop's envelope, Shopee's claimed-bar
 * grammar, quantity first. Pure function of the shared clock: refresh-proof,
 * identical for every viewer.
 */

interface Props {
  roomId: string;
  /** Demo/pitch override (?drop=pre|live|ended) — phase pinned from mount. */
  forcePhase?: DropPhase | null;
  onToast: (name: string, product: Product, remaining: number) => void;
  onClaimed: (claim: DropClaim, cycle: DropCycle) => void;
  onMissed: (cycle: DropCycle) => void;
}

const PHASE_OFFSET: Record<DropPhase, number> = {
  idle: 30_000,
  pre: 2 * 60_000 + 30_000, // 30s into the pre-countdown
  live: 3 * 60_000 + 80_000, // 80s into the live window
  ended: 8 * 60_000 + 10_000,
};

export function FlashDrop({ roomId, forcePhase, onToast, onClaimed, onMissed }: Props) {
  const now = useNow(1000); // null until mounted — the card is client-only
  const mountRef = useRef<number | null>(null);
  const lastBucketRef = useRef(-1);
  if (now !== null && mountRef.current === null) mountRef.current = now;

  // Forced phase maps real elapsed time onto a synthetic point in the cycle,
  // anchored to MOUNT time so a real 10-minute boundary can't jump the demo.
  let clock = now ?? 0;
  if (now !== null && forcePhase) {
    const anchor = mountRef.current ?? now;
    const cycleStart = Math.floor(anchor / 600_000) * 600_000;
    clock = cycleStart + PHASE_OFFSET[forcePhase] + (now - anchor);
  }
  const cycle = now === null ? null : dropCycle(roomId, clock);

  // Claim toasts ride the same simulation the bar reads — they always agree.
  useEffect(() => {
    if (!cycle || cycle.phase !== "live") return;
    const bucket = Math.floor((clock - cycle.startAt) / 4000);
    if (bucket <= lastBucketRef.current) return;
    lastBucketRef.current = bucket;
    if (cycle.claimed > 0 && bucket % 2 === 0 && !cycle.soldOut) {
      onToast(toastName(cycle.cycleId, bucket), cycle.product, cycle.remaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.phase, cycle?.cycleId, Math.floor((clock - (cycle?.startAt ?? 0)) / 4000)]);

  if (!cycle || cycle.phase === "idle") return null;

  const { product, config } = cycle;
  const discounted = config.dealPriceSen < product.priceSen;
  const pct = Math.round((cycle.claimed / config.stock) * 100);

  const claim = () => {
    const c = claimDrop(cycle, Date.now());
    if (c) onClaimed(c, cycle);
    else onMissed(cycle);
  };

  return (
    <div className={`drop-card drop-card--${cycle.phase}`}>
      {product.imageUrl && <img className="drop-thumb" src={product.imageUrl} alt="" />}
      <div className="drop-body">
        {cycle.phase === "pre" && (
          <>
            <span className="drop-label">DROP STARTS IN</span>
            <b className="drop-count num">{formatCountdown(countdownTo(cycle.startAt, clock))}</b>
            <span className="drop-title">{product.title}</span>
            <span className="drop-meta">
              {config.stock} units{discounted ? ` · ${formatRM(config.dealPriceSen)}` : ""}
            </span>
          </>
        )}
        {cycle.phase === "live" && (
          <>
            <span className="drop-headline">
              {cycle.soldOut ? (
                <b>Sold out · {config.stock} claimed</b>
              ) : (
                <b>
                  {cycle.remaining} of {config.stock} left
                </b>
              )}
              <span className="drop-count num">{formatCountdown(countdownTo(cycle.endAt, clock))}</span>
            </span>
            <span className="drop-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% claimed`}>
              <span className="drop-bar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="drop-title">{product.title}</span>
            <span className="drop-price">
              {formatRM(config.dealPriceSen)}
              {discounted && <s>{formatRM(product.priceSen)}</s>}
            </span>
          </>
        )}
        {cycle.phase === "ended" && (
          <>
            <span className="drop-label">DROP ENDED</span>
            <span className="drop-title">{product.title}</span>
            <span className="drop-meta">{cycle.claimed} claimed · back at the next show</span>
          </>
        )}
      </div>
      {cycle.phase === "live" && (
        <button
          className={`btn btn-primary drop-claim${cycle.soldOut || cycle.userClaimed ? " drop-claim--off" : ""}`}
          aria-disabled={cycle.userClaimed}
          onClick={() => {
            if (!cycle.userClaimed) claim();
          }}
        >
          {cycle.userClaimed ? "Yours ✓" : cycle.soldOut ? "Sold out" : "Claim"}
        </button>
      )}
    </div>
  );
}

// The result moment lives in LiveResult (components/live/LiveResult.tsx) —
// one shared overlay for drop claims, auction hammers and giveaway wins.
