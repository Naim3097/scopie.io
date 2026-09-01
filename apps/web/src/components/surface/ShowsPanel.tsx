"use client";

import Link from "next/link";
import { useNow, countdownTo, formatCountdown } from "@/lib/clock";
import { downloadShowIcs, googleCalendarUrl, whatsappShareUrl } from "@/lib/reminders";
import {
  upcomingShows,
  formatSlotTime,
  showLineup,
  showSeller,
  type Occurrence,
} from "@/lib/shows";
import { formatRM } from "@/lib/demo";

/**
 * The droplist — Scopie's published schedule. One fixed ritual (Malam Drop,
 * Thursday 9PM MYT) plus each brand's recurring slot. Every card is a
 * commerce surface: lineup visible, reminders one tap away, and the moment
 * a show goes live the card becomes the door.
 */

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
            <span className="show-when">{formatSlotTime(occ)} MYT</span>
          )}
          {!live && (
            <span className="show-count num" aria-label="Starts in">
              {formatCountdown(c)}
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
        <div className="show-actions">
          {live ? (
            <Link href={`/live/${occ.slot.roomId}`} className="btn btn-primary show-join">
              Join live ›
            </Link>
          ) : (
            <>
              <button className="show-act" onClick={() => downloadShowIcs(occ)}>
                ⏰ Remind me
              </button>
              <a className="show-act" href={googleCalendarUrl(occ)} target="_blank" rel="noreferrer">
                Google Cal
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
      <div className="sec-label" style={{ marginTop: 6 }}>
        THE DROPLIST
      </div>
      <h2 className="page-title" style={{ marginTop: 2 }}>
        Shows you don&rsquo;t want to miss.
      </h2>
      <p className="page-sub">
        Malam Drop every Thursday, 9PM. Reminders land in your own calendar — 15 minutes before showtime.
      </p>

      <div className="show-list">
        {week.map((o) => (
          <ShowCard key={`${o.slot.id}-${o.startMs}`} occ={o} now={now} />
        ))}
      </div>

      {later.length > 0 && (
        <>
          <div className="sec-label" style={{ marginTop: 24 }}>
            COMING WEEKS
          </div>
          <div className="show-later">
            {later.map((o) => (
              <div key={`${o.slot.id}-${o.startMs}`} className="show-later-row">
                <span className="show-later-when num">{formatSlotTime(o)}</span>
                <span className="grow">
                  <b>{o.slot.title}</b>
                  <span className="show-later-host"> · {showSeller(o.slot)?.name}</span>
                </span>
                <button className="show-act" onClick={() => downloadShowIcs(o)} aria-label={`Remind me: ${o.slot.title}`}>
                  ⏰
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-note">
        Times are Malaysia time (MYT). A show goes live in its room the moment the countdown ends.
      </div>
    </div>
  );
}
