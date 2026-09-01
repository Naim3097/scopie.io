"use client";

import { useEffect, useRef, useState } from "react";
import { useNow, countdownTo, formatCountdown } from "@/lib/clock";
import { formatRM } from "@/lib/demo";
import {
  CYCLE_MS,
  auctionState,
  bidIncrement,
  placeUserBid,
  readPrebid,
  readUserBids,
  writePrebid,
  writeUserBid,
  type AuctionPhase,
  type UserBid,
} from "@/lib/auction";
import { useCart } from "@/lib/cart";
import { useCommerce } from "@/components/commerce/Commerce";
import { SHOW_SLOTS, nextOccurrence, nextShow, formatSlotTime } from "@/lib/shows";
import { markWinHandled, winHandled } from "@/lib/wins";
import { LiveResult } from "./LiveResult";

/**
 * The in-room auction — soft close, proxy max, one lot on the block.
 * Pure replay of the shared clock + the user's own persisted bids, so a
 * refresh mid-auction reconstructs the identical state.
 */

interface Props {
  roomId: string;
  /** Demo/pitch override (?auction=preview|live|sold) — pinned from mount. */
  forcePhase?: AuctionPhase | null;
  onToast: (from: string, text: string, isSystem: boolean) => void;
  onPhase: (phase: AuctionPhase | null) => void;
}

const PHASE_OFFSET: Record<AuctionPhase, number> = {
  idle: 30_000,
  preview: 2 * 60_000 + 25_000, // 35s to the start
  live: 3 * 60_000 + 20_000, // 20s into the auction
  sold: 9 * 60_000, // safely past any soft-close extension
};

export function AuctionBlock({ roomId, forcePhase, onToast, onPhase }: Props) {
  const now = useNow(1000); // null until mounted — client-only, like every clock
  const mountRef = useRef<number | null>(null);
  if (now !== null && mountRef.current === null) mountRef.current = now;

  let clock = now ?? 0;
  if (now !== null && forcePhase) {
    // Anchor to MOUNT time — anchoring to `now` would jump the synthetic
    // clock a whole cycle when real time crosses a 10-minute boundary.
    const anchor = mountRef.current ?? now;
    const cycleStart = Math.floor(anchor / CYCLE_MS) * CYCLE_MS;
    clock = cycleStart + PHASE_OFFSET[forcePhase] + (now - anchor);
  }
  const cycleId = now === null ? null : `${roomId}:${Math.floor(clock / CYCLE_MS)}`;

  // The user's bid tape for this cycle — LS-backed, with an in-memory copy so
  // private-mode browsers still replay correctly within the session.
  const bidsRef = useRef<{ cycle: string; list: UserBid[] }>({ cycle: "", list: [] });
  const emittedRef = useRef(-1); // -1 = skip the pre-arrival bid history
  const prebidDoneRef = useRef("");
  const wonHandledRef = useRef("");
  const prevLeaderYouRef = useRef(false);
  const prevEndRef = useRef(0);
  const [, setVersion] = useState(0);
  const [flash, setFlash] = useState(false);
  const [maxOpen, setMaxOpen] = useState(false);
  const [maxSel, setMaxSel] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState("");
  const cart = useCart();
  const { openCart } = useCommerce();

  if (cycleId && bidsRef.current.cycle !== cycleId) {
    bidsRef.current = { cycle: cycleId, list: readUserBids(cycleId) };
    emittedRef.current = -1;
    prevLeaderYouRef.current = false;
    prevEndRef.current = 0;
    // A new lot must not inherit the previous lot's max panel or amount
    // (render-phase state adjustment — React's derived-state pattern).
    if (maxOpen) setMaxOpen(false);
    if (maxSel !== null) setMaxSel(null);
  }

  const state = now === null ? null : auctionState(roomId, clock, bidsRef.current.list);

  // Report the phase up (the page hides the list-price pin during a lot).
  useEffect(() => {
    onPhase(state?.phase ?? null);
    return () => onPhase(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase]);

  // Bid toasts: emit only what happened since the last render (skip history).
  useEffect(() => {
    if (!state) return;
    if (emittedRef.current === -1) {
      emittedRef.current = state.bids.length;
      return;
    }
    if (state.bids.length > emittedRef.current) {
      const fresh = state.bids.slice(emittedRef.current);
      emittedRef.current = state.bids.length;
      for (const b of fresh.slice(-3)) {
        if (b.isYou) onToast("•", `Scopie holds your bid at ${formatRM(b.amountSen)} 🔨`, true);
        else onToast(b.name, `bid ${formatRM(b.amountSen)} 🔨`, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.bids.length, state?.cycleId]);

  // The outbid nudge — once per lead change, never spammy.
  useEffect(() => {
    if (!state || state.phase !== "live") return;
    if (prevLeaderYouRef.current && !state.leaderIsYou) {
      onToast("•", `You've been outbid — ${formatRM(state.nextBidSen)} takes it back`, true);
    }
    prevLeaderYouRef.current = state.leaderIsYou;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.leaderIsYou]);

  // Soft-close flash: the clock just grew. Leaving the live phase always
  // clears it — a cleared timeout must never strand a phantom "+10s".
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "live") {
      setFlash(false);
      return;
    }
    if (prevEndRef.current !== 0 && state.endAt > prevEndRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1600);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.endAt, state?.phase]);
  useEffect(() => {
    if (state) prevEndRef.current = state.endAt;
  });

  // Pre-bid armed on the droplist → applied the moment this lot opens.
  useEffect(() => {
    if (!state || (state.phase !== "preview" && state.phase !== "live")) return;
    if (prebidDoneRef.current === state.cycleId) return;
    prebidDoneRef.current = state.cycleId;
    if (bidsRef.current.list.length > 0) return;
    const pb = readPrebid(roomId);
    if (pb === null) return;
    const bid: UserBid = { at: state.startAt, maxSen: Math.max(pb, state.config.startPriceSen) };
    writeUserBid(state.cycleId, bid);
    bidsRef.current = { cycle: state.cycleId, list: [...bidsRef.current.list, bid] };
    writePrebid(roomId, null);
    setVersion((v) => v + 1);
    onToast("•", `Your pre-bid is in — Scopie bids to ${formatRM(bid.maxSen)} for you`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.cycleId, state?.phase]);

  // A win commits at the hammer (auction semantics): one cart line, once —
  // persisted, because youWon re-derives true for the whole sold window and
  // a refresh must not re-add the line. Per-cycle line id: two wins in two
  // cycles are two lots at two hammer prices, never one line at the wrong one.
  useEffect(() => {
    if (!state || !state.youWon) return;
    if (wonHandledRef.current === state.cycleId || winHandled(state.cycleId)) return;
    wonHandledRef.current = state.cycleId;
    markWinHandled(state.cycleId);
    cart.add({
      ...state.product,
      id: `${state.product.id}__auction__${state.cycleId}`,
      title: `${state.product.title} · Auction`,
      priceSen: state.priceSen,
    });
    onToast("•", `Sold to you — ${formatRM(state.priceSen)} 🔨 Added to your cart.`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.youWon, state?.cycleId]);

  if (!state || state.phase === "idle") return null;
  const { product, config } = state;

  const bidNow = (maxSen: number) => {
    const bid = placeUserBid(state, maxSen, clock);
    if (!bid) {
      // Raced tap: a rival bid landed in the same beat and moved the price.
      if (state.phase === "live" && !state.leaderIsYou) {
        onToast("•", `Price moved — ${formatRM(state.nextBidSen)} takes it now`, true);
      }
      return;
    }
    bidsRef.current = { cycle: state.cycleId, list: [...bidsRef.current.list, bid] };
    setVersion((v) => v + 1);
  };

  const inc = bidIncrement(state.priceSen);
  const remaining = countdownTo(state.endAt, clock);
  const urgent = state.phase === "live" && remaining.totalMs < 11_000;
  const stepMin = state.leaderIsYou ? (state.userMaxSen ?? state.nextBidSen) + inc : state.nextBidSen;
  const maxShown = maxSel !== null && maxSel >= stepMin ? maxSel : stepMin + 4 * inc;

  const recent = clock - state.endAt < 90_000;
  const showWon = state.phase === "sold" && state.youWon && recent && dismissed !== state.cycleId;
  const showLost =
    state.phase === "sold" && !state.youWon && state.youParticipated && recent && dismissed !== state.cycleId;
  // "Next lot" means THIS room's next show — not whichever show is globally next.
  const roomSlot = SHOW_SLOTS.find((s) => s.roomId === roomId);
  const nextLot = roomSlot ? nextOccurrence(roomSlot, clock) : nextShow(clock);

  return (
    <>
      <div className={`auction-card auction-card--${state.phase}`}>
        {product.imageUrl && <img className="drop-thumb" src={product.imageUrl} alt="" />}
        <div className="drop-body">
          {state.phase === "preview" && (
            <>
              <span className="drop-label">AUCTION STARTS IN</span>
              <b className="drop-count num">{formatCountdown(countdownTo(state.startAt, clock))}</b>
              <span className="drop-title">{product.title}</span>
              <span className="drop-meta">
                Opens at {formatRM(config.startPriceSen)} · {config.lotNote}
              </span>
              {readPrebid(roomId) !== null && bidsRef.current.list.length === 0 && (
                <span className="auction-prebid-note">Pre-bid armed ✓</span>
              )}
            </>
          )}
          {state.phase === "live" && (
            <>
              <span className="drop-headline">
                <b className="num">{formatRM(state.priceSen)}</b>
                <span className={`drop-count num${urgent ? " auction-urgent" : ""}`}>
                  {formatCountdown(remaining)}
                  {/* "extended", not "+10s" — near the hard cap the reset can be shorter */}
                  {flash && <i className="auction-ext">extended</i>}
                </span>
              </span>
              <span className={`auction-leader${state.leaderIsYou ? " you" : ""}`}>
                {state.bidCount === 0
                  ? `Opening ask — no bids yet`
                  : state.leaderIsYou
                    ? `You lead ✓${state.userMaxSen && state.userMaxSen > state.priceSen ? ` · max ${formatRM(state.userMaxSen)}` : ""}`
                    : `${state.leaderName} leads`}
              </span>
              <span className="drop-title">{product.title}</span>
              <span className="drop-meta">
                {config.lotNote} · bids rise {formatRM(inc)}
              </span>
            </>
          )}
          {state.phase === "sold" && (
            <>
              <span className="drop-label">{state.bidCount > 0 ? "SOLD" : "PASSED"}</span>
              <span className="drop-title">{product.title}</span>
              <span className="drop-meta">
                {state.bidCount > 0
                  ? `${formatRM(state.priceSen)} · ${state.leaderIsYou ? "to you 🎉" : `to ${state.leaderName}`} · ${state.bidCount} bids`
                  : "No bids this lot — back at the next show"}
              </span>
            </>
          )}
        </div>
        {state.phase === "live" && (
          <div className="auction-actions">
            <button
              className={`btn btn-primary drop-claim${state.leaderIsYou ? " drop-claim--off" : ""}`}
              // aria-disabled, not disabled: the state stays focusable and
              // readable for keyboard/AT users; the click is a guarded no-op.
              aria-disabled={state.leaderIsYou}
              onClick={() => {
                if (!state.leaderIsYou) bidNow(state.nextBidSen);
              }}
            >
              {state.leaderIsYou ? "Leading ✓" : `Bid ${formatRM(state.nextBidSen)}`}
            </button>
            <button
              className={`auction-maxbtn${maxOpen ? " on" : ""}`}
              aria-expanded={maxOpen}
              onClick={() => {
                setMaxOpen((v) => !v);
                if (maxSel === null || maxSel < stepMin) setMaxSel(stepMin + 4 * inc);
              }}
            >
              Max bid
            </button>
          </div>
        )}
      </div>

      {state.phase === "live" && maxOpen && (
        <div className="auction-max">
          <div className="auction-stepper">
            <button
              aria-label="Lower max bid"
              onClick={() => setMaxSel(Math.max(stepMin, maxShown - inc))}
              disabled={maxShown <= stepMin}
            >
              −
            </button>
            <b className="num">{formatRM(maxShown)}</b>
            <button aria-label="Raise max bid" onClick={() => setMaxSel(maxShown + inc)}>
              +
            </button>
          </div>
          <SlideToArm
            label={`Arm max bid ${formatRM(maxShown)}`}
            onArm={() => {
              bidNow(maxShown);
              setMaxOpen(false);
              onToast("•", `Max bid armed at ${formatRM(maxShown)} — Scopie bids for you`, true);
            }}
          />
          <span className="auction-max-note">Scopie bids the minimum needed — up to your max, never past it.</span>
        </div>
      )}

      {showWon && (
        <LiveResult
          celebrate
          word="Menang! 🔨"
          product={product}
          nameLine={product.title}
          priceLine={`Hammer price ${formatRM(state.priceSen)}${state.userMaxSen && state.userMaxSen > state.priceSen ? ` — under your ${formatRM(state.userMaxSen)} max` : ""}`}
          primaryLabel="Checkout now"
          onPrimary={() => {
            setDismissed(state.cycleId);
            openCart();
          }}
          shareText={`Menang! 🔨 Won the ${product.title} at ${formatRM(state.priceSen)} on Scopie Live: https://scopie.io/welcome`}
          onClose={() => setDismissed(state.cycleId)}
        />
      )}
      {showLost && (
        <LiveResult
          celebrate={false}
          word="Outbid"
          product={product}
          nameLine={`Went to ${state.leaderName} for ${formatRM(state.priceSen)}`}
          priceLine={`Next lot: ${formatSlotTime(nextLot)}`}
          primaryLabel="Keep watching"
          onPrimary={() => setDismissed(state.cycleId)}
          shareText={`This ${product.title} just went for ${formatRM(state.priceSen)} on Scopie Live 🔨 The droplist: https://scopie.io/?panel=shows`}
          onClose={() => setDismissed(state.cycleId)}
        />
      )}
    </>
  );
}

/**
 * Slide-to-arm: the fast-context confirm (iOS power-off, payment apps) — a
 * drag can't be fat-fingered mid-auction the way a tap can. Keyboard and
 * screen-reader users arm with Enter/Space on the same control.
 */
function SlideToArm({ label, onArm }: { label: string; onArm: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const KNOB = 44;

  const span = () => Math.max(1, (trackRef.current?.clientWidth ?? 200) - KNOB - 8);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    setX(Math.max(0, Math.min(span(), e.clientX - rect.left - KNOB / 2)));
  };
  const onPointerUp = () => {
    setDragging(false);
    // ~75% threshold — users don't reliably slide to 100% (Swiggy's slide-to-pay finding).
    if (x >= span() * 0.75) {
      setX(0);
      onArm();
    } else {
      setX(0);
    }
  };

  return (
    <div className="slide-arm" ref={trackRef}>
      <span className="slide-arm-fill" style={{ width: x + KNOB / 2 }} aria-hidden="true" />
      <span className="slide-arm-label" aria-hidden="true" style={{ opacity: 1 - x / Math.max(1, span()) }}>
        Slide to arm →
      </span>
      <button
        className={`slide-arm-knob${dragging ? " dragging" : ""}`}
        style={{ transform: `translateX(${x}px)` }}
        aria-label={`${label} — slide right, or press Enter`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDragging(false);
          setX(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onArm();
          }
        }}
      >
        🔨
      </button>
    </div>
  );
}
