"use client";

import { useEffect } from "react";
import type { Product } from "@scopie/core";

/**
 * The shared result moment — auction wins, outbids, giveaway wins all land
 * on the same full-screen beat the drop's Dapat! established. Confetti only
 * on a win; Rehearsal chip always (simulated commerce is labeled, always).
 */
export function LiveResult({
  celebrate,
  word,
  product,
  nameLine,
  priceLine,
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
  primaryLabel: string;
  onPrimary: () => void;
  shareText: string;
  onClose: () => void;
}) {
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
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className="drop-result" role="dialog" aria-modal="true" aria-label={word}>
      <div className={`drop-result-card${celebrate ? "" : " drop-result-card--missed"}`}>
        {product.imageUrl && <img src={product.imageUrl} alt="" />}
        <b className="drop-result-word">{word}</b>
        <span className="drop-result-name">{nameLine}</span>
        <span className="drop-result-price">{priceLine}</span>
        <div className="drop-result-actions">
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button className="drop-result-share" onClick={share}>
            Share on WhatsApp
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
