"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useNow, countdownTo, formatCountdown } from "@/lib/clock";
import { AUCTIONS, bidIncrement, readPrebid, writePrebid } from "@/lib/auction";
import { demoProducts } from "@/lib/catalog";
import { award, mytDay } from "@/lib/scop";
import { downloadShowIcs, googleCalendarUrl, whatsappShareUrl } from "@/lib/reminders";
import {
  upcomingShows,
  formatSlotTime,
  showLineup,
  showSeller,
  type Occurrence,
} from "@/lib/shows";
import { formatRM } from "@/lib/demo";
import { DEMO_MODE } from "@/lib/api";

/**
 * The droplist — Scopie's published schedule. One fixed ritual (Malam Drop,
 * Thursday 9PM MYT) plus each brand's recurring slot. Every card is a
 * commerce surface: lineup visible, reminders one tap away, and the moment
 * a show goes live the card becomes the door.
 */

/**
 * Pre-bid: arm a proxy max from the droplist; the moment that room's lot
 * opens, Scopie bids for you (up to your max, never at it). Whatnot lets
 * buyers bid before the stream — this is that, Rehearsal tier.
 */
function PrebidRow({ roomId, live }: { roomId: string; live: boolean }) {
  const cfg = AUCTIONS[roomId];
  const [armed, setArmed] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setArmed(readPrebid(roomId)), [roomId]);
  if (!cfg || live) return null;
  const lot = demoProducts.find((p) => p.id === cfg.productId);
  if (!lot) return null;
  const inc = bidIncrement(cfg.startPriceSen);
  const value = sel ?? cfg.startPriceSen + 4 * inc;

  return (
    <div className="prebid-row">
      <span className="prebid-lot">
        Lot: <b>{lot.title}</b> · opens {formatRM(cfg.startPriceSen)}
        {DEMO_MODE && <span className="rehearsal-chip">Rehearsal</span>}
      </span>
      {armed !== null ? (
        <span className="prebid-armed">
          Pre-bid armed at {formatRM(armed)}
          <button
            className="prebid-clear"
            onClick={() => {
              writePrebid(roomId, null);
              setArmed(null);
            }}
          >
            Remove
          </button>
        </span>
      ) : (
        <span className="prebid-set">
          <button aria-label="Lower pre-bid" onClick={() => setSel(Math.max(cfg.startPriceSen, value - inc))}>
            −
          </button>
          <b className="num">{formatRM(value)}</b>
          <button aria-label="Raise pre-bid" onClick={() => setSel(value + inc)}>
            +
          </button>
          <button
            className="prebid-arm"
            onClick={() => {
              writePrebid(roomId, value);
              setArmed(value);
              award("prebid", `prebid:${roomId}:${mytDay(Date.now())}`);
            }}
          >
            Arm pre-bid
          </button>
        </span>
      )}
    </div>
  );
}

function ShowCard({ occ, now }: { occ: Occurrence; now: number }) {
  const seller = showSeller(occ.slot);
  const lineup = showLineup(occ.slot);
  const live = occ.state === "live";
  const c = countdownTo(occ.startMs, now);

  return (
    <article className={`show-card${live ? " show-card--live" : ""}`}>
      <img className="show-card-poster" src={occ.slot.poster} alt="" loading="lazy" />
      <div className="show-card-scrim" aria-hidden="true" />
      <div className="show-card-body">
        <div className="show-card-top">
          {live ? (
            <span className="live-chip">
              <span className="dot" aria-hidden="true" />
              Live now
            </span>
          ) : (
            <span className="show-when">
              {formatSlotTime(occ)} MYT
              <span className="show-count num" aria-label={`Starts in ${formatCountdown(c)}`}>
                {formatCountdown(c)}
              </span>
            </span>
          )}
        </div>
        <b className="show-title">{occ.slot.title}</b>
        <span className="show-host">
          {seller?.name} · hosted by {occ.slot.host}
        </span>
        {lineup.length > 0 && (
          <div className="show-lineup" aria-label="Lineup">
            {lineup.map((p) => (
              <span key={p.id} className="show-lineup-item">
                {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
                <span>{formatRM(p.priceSen).replace(".00", "")}</span>
              </span>
            ))}
          </div>
        )}
        <PrebidRow roomId={occ.slot.roomId} live={live} />
        <div className="show-actions">
          {live ? (
            <Link href={`/live/${occ.slot.roomId}`} className="btn btn-primary show-join">
              Join live
            </Link>
          ) : (
            <>
              <button className="show-act show-act--primary" onClick={() => downloadShowIcs(occ)}>
                Remind me
              </button>
              <a className="show-act" href={googleCalendarUrl(occ)} target="_blank" rel="noreferrer">
                Google Calendar
              </a>
              <a className="show-act" href={whatsappShareUrl(occ)} target="_blank" rel="noreferrer">
                Share
              </a>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function ShowsPanel() {
  const now = useNow();
  if (now === null) return null; // clock is client-only — no SSR drift
  const shows = upcomingShows(now, 3);
  const week = shows.filter((o) => o.startMs - now < 7 * 86400000);
  const later = shows.filter((o) => o.startMs - now >= 7 * 86400000);

  return (
    <div className="panel-pad">
      <p className="panel-lede">
        Malam Drop every Thursday, 9PM. Reminders land in your own calendar, 15 minutes before showtime.
      </p>

      <div className="show-list">
        {week.map((o) => (
          <ShowCard key={`${o.slot.id}-${o.startMs}`} occ={o} now={now} />
        ))}
      </div>

      {later.length > 0 && (
        <>
          <h3 className="section-head">Coming weeks</h3>
          <div className="show-later">
            {later.map((o) => (
              <div key={`${o.slot.id}-${o.startMs}`} className="show-later-row">
                <span className="show-later-when num">{formatSlotTime(o)}</span>
                <span className="grow">
                  <b>{o.slot.title}</b>
                  <span className="show-later-host"> · {showSeller(o.slot)?.name}</span>
                </span>
                <button className="show-act" onClick={() => downloadShowIcs(o)} aria-label={`Remind me: ${o.slot.title}`}>
                  Remind me
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="section-note">Times are Malaysia time. A show goes live in its room the moment the countdown ends.</p>
    </div>
  );
}
