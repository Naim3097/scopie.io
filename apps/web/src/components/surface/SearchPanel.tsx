"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@scopie/core";
import { StrokeIcon } from "@/components/Glyph";
import { ProductCard } from "@/components/ProductCard";
import { useCommerce } from "@/components/commerce/Commerce";
import { apiGet, DEMO_MODE } from "@/lib/api";
import { useNow, countdownTo, formatCountdown } from "@/lib/clock";
import { RAYA_EDIT, collectionProducts } from "@/lib/collections";
import { demoProducts, formatRM } from "@/lib/demo";
import { upcomingShows, formatSlotTime, showSeller } from "@/lib/shows";

type Sort = "trending" | "foryou";

/** The seasonal edit — cross-brand merchandising inside Discover. */
function EditRail() {
  const { openProduct } = useCommerce();
  const items = DEMO_MODE ? collectionProducts(RAYA_EDIT).slice(0, 8) : [];
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="section-head">
        {RAYA_EDIT.title}
        <span className="section-head-sub">curated across brands</span>
      </h3>
      <div className="edit-rail" role="group" aria-label={RAYA_EDIT.title}>
        {items.map((p) => (
          <button key={p.id} className="edit-card" onClick={() => openProduct(p, "search")}>
            {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
            <span className="edit-card-body">
              <b>{p.title}</b>
              <em>{formatRM(p.priceSen)}</em>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Discovery-with-intent: the browse grid, in a panel over the surface.
 * Conversational queries hand off to the Ask Scopie panel (onAsk).
 */
/** The Upcoming rail — the droplist's front porch inside Discover. */
function ShowRail({ onShows }: { onShows: () => void }) {
  const now = useNow(1000);
  if (now === null) return null; // clock is client-only — no SSR drift
  const next = upcomingShows(now, 1).slice(0, 4);
  return (
    <div className="show-rail" role="group" aria-label="Upcoming shows">
      {next.map((o) => (
        <button key={`${o.slot.id}-${o.startMs}`} className="show-rail-card" onClick={onShows}>
          <img src={o.slot.poster} alt="" loading="lazy" />
          <span className="show-rail-scrim" aria-hidden="true" />
          <span className="show-rail-body">
            {o.state === "live" ? (
              <span className="live-chip">
                <span className="dot" aria-hidden="true" />
                Live
              </span>
            ) : (
              <span className="show-rail-count num">{formatCountdown(countdownTo(o.startMs, now))}</span>
            )}
            <b>{o.slot.title}</b>
            <span className="show-rail-when">
              {showSeller(o.slot)?.name} · {formatSlotTime(o)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function SearchPanel({ onAsk, onShows }: { onAsk: (query?: string) => void; onShows: () => void }) {
  // Demo picks seed synchronously — no spinner frame on open.
  const [picks, setPicks] = useState<Product[]>(() => (DEMO_MODE ? demoProducts : []));
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [sort, setSort] = useState<Sort>("trending");

  useEffect(() => {
    if (DEMO_MODE) return;
    void apiGet<Product[]>("/v1/products/picks?limit=12", demoProducts).then((p) => {
      // A configured store that answers 200 [] stays honestly empty.
      setPicks(p);
      setLoading(false);
    });
  }, []);

  const shown = useMemo(() => {
    if (sort === "foryou") {
      return [...picks].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    }
    return picks;
  }, [picks, sort]);

  return (
    <div className="panel-pad">
      {/* The intent path leads. It used to sit behind two rails and nineteen
          tap targets — on a screen whose whole job is "find me something". */}
      <button className="searchbar" onClick={() => onAsk()}>
        <StrokeIcon kind="discover" size={18} />
        <span className="searchbar-hint">Tell me what you&rsquo;re looking for…</span>
      </button>

      <h3 className="section-head">Upcoming shows</h3>
      <ShowRail onShows={onShows} />

      <EditRail />

      <h3 className="section-head">For you</h3>
      <div className="chips" role="group" aria-label="Sort picks">
        <button className={`chip${sort === "trending" ? " chip-on" : ""}`} aria-pressed={sort === "trending"} onClick={() => setSort("trending")}>
          Trending
        </button>
        <button className={`chip${sort === "foryou" ? " chip-on" : ""}`} aria-pressed={sort === "foryou"} onClick={() => setSort("foryou")}>
          Picked for you
        </button>
      </div>
      {loading ? (
        <div className="buffering" style={{ position: "static", padding: "30px 0" }} role="status" aria-label="Loading picks">
          <div className="ring ring--ink"></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="section-note" style={{ marginTop: 0 }}>
          Sellers are stocking their shelves — check back soon for your first picks.
        </div>
      ) : (
        <div className="grid2">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
