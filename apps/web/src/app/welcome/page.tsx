"use client";

import Link from "next/link";
import { HelmetMark, Wordmark } from "@/components/Brand";
import { useNow, countdownTo } from "@/lib/clock";
import { demoSellers } from "@/lib/catalog";
import { downloadShowIcs, whatsappShareUrl } from "@/lib/reminders";
import { SHOW_SLOTS, nextOccurrence, formatSlotTime } from "@/lib/shows";

/**
 * The landing — what Scopie is, for someone who has never opened it.
 * Product-led and honest: the phone shows the real app's live surface, the
 * countdown ticks to a real show, and no number on this page is invented.
 */

const BRAND_LOGOS: [string, string][] = [
  ["hoor", "/brand/hoor-logo.svg"],
  ["sugarbomb", "/brand/sugarbomb-logo.png"],
  ["jomkaki", "/brand/jomkaki-logo.png"],
  ["bina", "/brand/bina-logo.webp"],
  ["benefigs", "/brand/benefigs-logo.svg"],
  ["tropicor", "/brand/tropicor-logo.webp"],
  ["firstclasscredit", "/brand/fcc-logo.webp"],
  ["factorycredit", "/brand/factorycredit-logo.webp"],
  ["ombakdamai", "/brand/ombak-logo.webp"],
  ["maelburger", "/brand/mael-logo.webp"],
];
const BRAND_NAMES = ["Kalima", "Belum.my", "Konbinio", "Glimsy × Amanina", "BYKI", "TongRoroBin"];

const two = (n: number) => String(n).padStart(2, "0");

function MalamDropClock() {
  const now = useNow();
  // Clock is client-only (no SSR wall-clock agreement) — hold the space.
  if (now === null) return <div className="lp-clock-wrap" aria-hidden="true" />;
  const occ = nextOccurrence(SHOW_SLOTS[0]!, now);
  const c = countdownTo(occ.startMs, now);
  const live = occ.state === "live";
  return (
    <div className="lp-clock-wrap">
      {live ? (
        <Link href={`/live/${occ.slot.roomId}`} className="btn btn-primary lp-live-cta">
          <span className="dot" aria-hidden="true" /> Live now — join the drop ›
        </Link>
      ) : (
        <>
          <div className="lp-clock num" role="timer" aria-label="Time to the next Malam Drop">
            {c.days > 0 && (
              <span className="lp-clock-cell">
                <b>{c.days}</b>
                <i>days</i>
              </span>
            )}
            <span className="lp-clock-cell">
              <b>{two(c.hours)}</b>
              <i>hrs</i>
            </span>
            <span className="lp-clock-cell">
              <b>{two(c.minutes)}</b>
              <i>min</i>
            </span>
            <span className="lp-clock-cell">
              <b>{two(c.seconds)}</b>
              <i>sec</i>
            </span>
          </div>
          <div className="lp-clock-actions">
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => downloadShowIcs(occ)}>
              ⏰ Remind me
            </button>
            <a className="lp-ghost-btn" href={whatsappShareUrl(occ)} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** "Also this week" — day names shift with the wall-clock, so client-only. */
function WeekSlots() {
  const now = useNow(60_000);
  if (now === null) return null;
  return (
    <p className="lp-ritual-slots">
      Also this week: {SHOW_SLOTS.slice(1).map((s, i) => {
        const seller = demoSellers[s.sellerId]?.name ?? s.sellerId;
        return (
          <span key={s.id}>
            {i > 0 && " · "}
            <b>{seller}</b> {formatSlotTime(nextOccurrence(s, now))}
          </span>
        );
      })}
    </p>
  );
}

export default function WelcomePage() {
  const malam = SHOW_SLOTS[0]!;
  return (
    <main className="lp">
      {/* nav */}
      <header className="lp-nav">
        <span className="brand">
          <span className="brand-visual" aria-hidden="true">
            <HelmetMark size={30} />
            <Wordmark color="#695ACD" />
          </span>
          <span className="sr-only">Scopie</span>
        </span>
        <Link href="/" className="btn btn-primary lp-nav-cta">
          Open Scopie
        </Link>
      </header>

      {/* hero */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="sec-label">MALAYSIA&rsquo;S AI SHOPPING NETWORK</p>
          <h1>
            Shopping, live.
            <br />
            Hosted by <span className="brand-name">AI</span>.
          </h1>
          <p className="lp-sub">
            Real Malaysian brands, live shows with an AI host that actually answers — sizes, prices, stock — and
            checkout where your money is held until your order arrives. One screen. No app store needed.
          </p>
          <div className="lp-cta-row">
            <Link href="/" className="btn btn-primary" style={{ width: "auto" }}>
              Open Scopie — it&rsquo;s free
            </Link>
            <a href="#droplist" className="lp-ghost-btn">
              See the droplist ↓
            </a>
          </div>
          <p className="lp-note">Works in your browser · installs from Safari &amp; Chrome</p>
        </div>

        <div className="lp-phone" aria-hidden="true">
          <video
            src="/videos/kalima-ai-model.mp4"
            poster="/videos/posters/kalima-ai-model.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
          <span className="lp-phone-top">
            <span className="live-chip">
              <span className="dot" /> Live
            </span>
            {/* the room's own named host — Kalima's show, kalima.ai on mic */}
            <span className="scopie-chip">
              <HelmetMark size={15} />
              kalima.ai
            </span>
          </span>
          <span className="lp-phone-chat">
            <span className="lp-bubble lp-bubble-user">Ada size apa untuk kurta ni?</span>
            <span className="lp-bubble lp-bubble-ai">Kurta Zaid comes in S–XXL, 6 colours — RM 99.00 ✨</span>
          </span>
          <span className="lp-phone-pin">
            <img src="/products/kalima/kurta-zaid-brick.webp" alt="" />
            <span>
              <b>Kalima Kurta Zaid</b>
              <em>RM 99.00</em>
            </span>
            <span className="lp-pin-buy">Buy</span>
          </span>
        </div>
      </section>

      {/* brand wall */}
      <section className="lp-brands">
        <p className="sec-label" style={{ textAlign: "center" }}>16 MALAYSIAN BRANDS, ALREADY HOME</p>
        <div className="lp-brand-wall">
          {BRAND_LOGOS.map(([id, src]) => (
            <span key={id} className="lp-brand-tile" title={demoSellers[id]?.name}>
              <img src={src} alt={demoSellers[id]?.name ?? id} loading="lazy" />
            </span>
          ))}
          {BRAND_NAMES.map((n) => (
            <span key={n} className="lp-brand-tile lp-brand-text">
              {n}
            </span>
          ))}
        </div>
      </section>

      {/* three ways */}
      <section className="lp-modules">
        <h2>Three ways in. One marketplace.</h2>
        <div className="lp-mod-grid">
          <div className="lp-mod">
            <span className="hub-tile hub-tile--pearl" aria-hidden="true">
              <HelmetMark size={44} fill="gradient" />
            </span>
            <b>
              Scop<span className="lp-tail">ios</span>
            </b>
            <p>The feed and the live shows — swipe, watch, ask, buy without leaving the video.</p>
          </div>
          <div className="lp-mod">
            <span className="hub-tile hub-tile--midnight" aria-hidden="true">
              <HelmetMark size={44} fill="#ffffff" />
            </span>
            <b>
              Sco<span className="lp-tail">pping</span>
            </b>
            <p>Ask Scopie for anything — &ldquo;a batik kaftan for raya&rdquo; — and get real products, real prices.</p>
          </div>
          <div className="lp-mod">
            <span className="hub-tile hub-tile--violet" aria-hidden="true">
              <HelmetMark size={44} fill="#ffffff" />
            </span>
            <b>
              Sco<span className="lp-tail">pay</span>
            </b>
            <p>Checkout with FPX, DuitNow &amp; e-wallets. Your money is held until delivery — that&rsquo;s the rule.</p>
          </div>
        </div>
      </section>

      {/* the ritual */}
      <section className="lp-ritual" id="droplist">
        <p className="sec-label" style={{ color: "var(--lilac)" }}>THE RITUAL</p>
        <h2>
          Malam Drop.
          <br />
          Every Thursday, 9PM.
        </h2>
        <p className="lp-ritual-sub">
          One night a week, the best of Scopie drops live — limited pieces, real deals, first come first served.
          Put it in your calendar; your phone reminds you 15 minutes before showtime.
        </p>
        <MalamDropClock />
        <WeekSlots />
      </section>

      {/* the host */}
      <section className="lp-host">
        <div className="lp-host-mark" aria-hidden="true">
          <HelmetMark size={92} />
        </div>
        <div>
          <h2>Every brand gets its own host. Named after them.</h2>
          <p className="lp-sub">
            hoor.ai runs HOOR&rsquo;s try-ons. kalima.ai styles the Raya drops. maelburger.ai calls Smash Night.
            Every answer is grounded in that seller&rsquo;s real product data — prices come from the catalog, never
            made up. And the .ai in the name means what it says: the host is AI, disclosed by design.
          </p>
          <ul className="lp-host-points">
            <li>Your brand&rsquo;s host answers sizing, stock and price questions live, in BM or English</li>
            <li>The name is the disclosure — a .ai host never pretends to be human</li>
            <li>Buying always ends with your tap. Money never moves without it</li>
          </ul>
          <div className="lp-host-family" aria-hidden="true">
            {["hoor.ai", "kalima.ai", "sugarbomb.ai", "maelburger.ai", "scopie.ai"].map((h) => (
              <span key={h} className="scopie-chip scopie-chip--ink">
                <HelmetMark size={15} />
                {h}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* install + sell */}
      <section className="lp-final">
        <div className="lp-final-card">
          <h3>Shop it</h3>
          <p>Open scopie.io, then add it to your home screen — Share → &ldquo;Add to Home Screen&rdquo; on iPhone,
          &ldquo;Install app&rdquo; on Android. No app store, no wait.</p>
          <Link href="/" className="btn btn-primary" style={{ width: "auto" }}>
            Open Scopie
          </Link>
        </div>
        <div className="lp-final-card lp-final-card--dark">
          <h3>Sell on it</h3>
          <p>Your brand, a live show, and your own named host — yourbrand.ai — that never sleeps. With escrow
          your buyers can trust and fees that respect your margin.</p>
          <Link href="/sell" className="btn btn-primary" style={{ width: "auto" }}>
            Start selling
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <span className="brand">
          <span className="brand-visual" aria-hidden="true">
            <HelmetMark size={24} />
            <Wordmark color="#695ACD" />
          </span>
          <span className="sr-only">Scopie</span>
        </span>
        <nav aria-label="Footer">
          <Link href="/">Open the app</Link>
          <Link href="/?panel=shows">Droplist</Link>
          <Link href="/sell">Sell on Scopie</Link>
        </nav>
        <span className="lp-copy">© 2026 Scopie · Built in Malaysia 🇲🇾</span>
      </footer>
    </main>
  );
}
