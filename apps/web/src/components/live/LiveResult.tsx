"use client";

import { useEffect, useRef } from "react";
import type { Product } from "@scopie/core";
import { award, mytDay } from "@/lib/scop";
import { shareMoment } from "@/lib/sharecard";

/**
 * The shared result moment — drop claims, auction wins, outbids, giveaway
 * wins all land on the same full-screen beat. Confetti only on a win;
 * Rehearsal chip always (simulated commerce is labeled, always). Sharing
 * renders the branded card (lib/sharecard.ts) with the disclosure painted in.
 */
export function LiveResult({
  celebrate,
  word,
  product,
  nameLine,
  priceLine,
  host,
  primaryLabel,
  onPrimary,
  shareText,
  onClose,
}: {
  celebrate: boolean;
  word: string;
  product: Product;
  nameLine: string;
  priceLine: string;
  host?: string;
  primaryLabel: string;
  onPrimary: () => void;
  shareText: string;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // A dialog owns the keyboard: focus moves in on open, Escape dismisses,
  // and focus returns to where the user was when it closes.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!celebrate) return;
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const opts = { disableForReducedMotion: true, useWorker: true, zIndex: 76 };
      void confetti({ ...opts, particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: ["#695ACD", "#9485EB", "#CBBDF7", "#ffffff"] });
      setTimeout(() => void confetti({ ...opts, particleCount: 40, spread: 100, origin: { y: 0.4 } }), 350);
    });
    return () => {
      cancelled = true;
    };
  }, [celebrate]);

  const share = () => {
    // The Rehearsal disclosure travels WITH the share — a recipient outside
    // the app must not read a simulated result as a real transaction.
    const text = `${shareText}\n(Scopie Rehearsal preview — simulated show)`;
    award("share", `share:${mytDay(Date.now())}`);
    void shareMoment(
      { word, title: product.title, priceLine, host, imageUrl: product.imageUrl },
      text,
    );
  };

  return (
    <div
      className="drop-result"
      role="dialog"
      aria-modal="true"
      aria-label={word}
      onClick={(e) => {
        // Tapping the scrim dismisses — the card itself never does.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={cardRef} tabIndex={-1} className={`drop-result-card${celebrate ? "" : " drop-result-card--missed"}`}>
        {product.imageUrl && <img src={product.imageUrl} alt="" />}
        <b className="drop-result-word">{word}</b>
        <span className="drop-result-name">{nameLine}</span>
        <span className="drop-result-price">{priceLine}</span>
        <div className="drop-result-actions">
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button className="drop-result-share" onClick={share}>
            Share the moment
          </button>
          <button className="drop-result-share" onClick={onClose}>
            Keep watching
          </button>
        </div>
        <span className="rehearsal-chip">Rehearsal</span>
      </div>
    </div>
  );
}
