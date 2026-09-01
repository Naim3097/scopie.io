"use client";

import { useEffect, useRef, useState } from "react";
import { useNow, countdownTo, formatCountdown } from "@/lib/clock";
import { formatRM } from "@/lib/demo";
import { CYCLE_MS, enterGiveaway, giveawayState, hasEntered, type GiveawayPhase } from "@/lib/giveaway";
import { useCart } from "@/lib/cart";
import { roomHost } from "@/lib/hosts";
import { award } from "@/lib/scop";
import { markWinHandled, winHandled } from "@/lib/wins";
import { useCommerce } from "@/components/commerce/Commerce";
import { LiveResult } from "./LiveResult";

/**
 * The in-room giveaway — Whatnot's crowd-puller, Rehearsal-simulated:
 * free one-tap entry, entries climb on the shared clock, winner drawn
 * deterministically from the cycle seed.
 */

interface Props {
  roomId: string;
  /** Demo/pitch override (?giveaway=open|drawing|done) — pinned from mount. */
  forcePhase?: GiveawayPhase | null;
  onToast: (from: string, text: string, isSystem: boolean) => void;
  /** Lifted so the stage can give this card the product surface. */
  onPhase?: (phase: GiveawayPhase | null) => void;
}

const PHASE_OFFSET: Record<GiveawayPhase, number> = {
  idle: 30_000,
  open: 3 * 60_000 + 40_000,
  drawing: 7 * 60_000 + 3_000,
  done: 7 * 60_000 + 32_000,
};

export function GiveawayBlock({ roomId, forcePhase, onToast, onPhase }: Props) {
  const now = useNow(1000);
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

  // Session copy of "entered" so private-mode browsers keep their entry.
  const enteredRef = useRef<{ cycle: string; entered: boolean }>({ cycle: "", entered: false });
  const announcedRef = useRef("");
  const wonHandledRef = useRef("");
  const [, setVersion] = useState(0);
  const [dismissed, setDismissed] = useState("");
  const cart = useCart();
  const { openCart } = useCommerce();

  if (cycleId && enteredRef.current.cycle !== cycleId) {
    enteredRef.current = { cycle: cycleId, entered: hasEntered(cycleId) };
  }

  const state = now === null ? null : giveawayState(roomId, clock, enteredRef.current.entered);

  // Lift the phase — an open giveaway owns the product surface (see FlashDrop).
  const phase = state?.phase ?? null;
  useEffect(() => {
    onPhase?.(phase);
    return () => onPhase?.(null);
  }, [phase, onPhase]);

  // Announce the winner in chat, once per cycle.
  useEffect(() => {
    if (!state || state.phase !== "done" || !state.winner) return;
    if (announcedRef.current === state.cycleId) return;
    announcedRef.current = state.cycleId;
    // Only announce while the moment is fresh — not when scrolling in later.
    if (clock - state.announceAt < 60_000) {
      onToast("Scopie", state.youWon ? "Giveaway winner: you" : `Giveaway winner: ${state.winner}`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.cycleId]);

  // A win claims as a free cart line, once — persisted (youWon re-derives
  // true for the whole done window; a refresh must not re-add the line).
  useEffect(() => {
    if (!state || !state.youWon) return;
    if (wonHandledRef.current === state.cycleId || winHandled(state.cycleId)) return;
    wonHandledRef.current = state.cycleId;
    markWinHandled(state.cycleId);
    cart.add({
      ...state.product,
      id: `${state.product.id}__giveaway__${state.cycleId}`,
      title: `${state.product.title} · Giveaway win`,
      priceSen: 0,
    });
    award("giveaway_win", `scopw:${state.cycleId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.youWon, state?.cycleId]);

  if (!state || state.phase === "idle") return null;
  const { product } = state;

  const enter = () => {
    if (enteredRef.current.entered || state.phase !== "open") return;
    enterGiveaway(state.cycleId);
    enteredRef.current = { cycle: state.cycleId, entered: true };
    setVersion((v) => v + 1);
    const pts = award("giveaway_enter", `scope:${state.cycleId}`);
    onToast("Scopie", `You're in — winner drawn live${pts ? ` +${pts} SCOP` : ""}`, true);
  };

  const recent = clock - state.announceAt < 90_000;
  const showWon = state.phase === "done" && state.youWon && recent && dismissed !== state.cycleId;

  return (
    <>
      <div className={`giveaway-card giveaway-card--${state.phase}`}>
        {product.imageUrl && <img className="drop-thumb" src={product.imageUrl} alt="" />}
        <div className="drop-body">
          {state.phase === "open" && (
            <>
              <span className="drop-headline">
                <b>Giveaway</b>
                <span className="drop-count num">{formatCountdown(countdownTo(state.closesAt, clock))}</span>
              </span>
              <span className="drop-title">{product.title}</span>
              <span className="drop-meta">
                {state.config.note} · worth {formatRM(product.priceSen)} · {state.entries} in
              </span>
            </>
          )}
          {state.phase === "drawing" && (
            <>
              <span className="drop-label">Drawing…</span>
              <span className="drop-title giveaway-drum">{product.title}</span>
              <span className="drop-meta">{state.entries} entries · winner any second</span>
            </>
          )}
          {state.phase === "done" && (
            <>
              <span className="drop-label">Giveaway winner</span>
              <span className="drop-title">{state.youWon ? "You" : state.winner}</span>
              <span className="drop-meta">
                {product.title} · {state.entries} entered
              </span>
            </>
          )}
        </div>
        {state.phase === "open" && (
          <button
            className={`btn btn-primary drop-claim${state.userEntered ? " drop-claim--off" : ""}`}
            aria-disabled={state.userEntered}
            onClick={enter}
          >
            {state.userEntered ? "You're in" : "Enter free"}
          </button>
        )}
      </div>

      {showWon && (
        <LiveResult
          celebrate
          word="Rezeki!"
          product={product}
          host={roomHost(roomId)}
          nameLine={product.title}
          priceLine={`Yours free — tonight's giveaway (worth ${formatRM(product.priceSen)})`}
          primaryLabel="Claim — RM 0.00"
          onPrimary={() => {
            setDismissed(state.cycleId);
            openCart();
          }}
          shareText={`Rezeki! Just won the ${product.title} on Scopie Live — free. Smash Night, Fridays 9:30PM: https://scopie.io/welcome`}
          onClose={() => setDismissed(state.cycleId)}
        />
      )}
    </>
  );
}
