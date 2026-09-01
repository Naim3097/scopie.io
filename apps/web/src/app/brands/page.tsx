"use client";

import Link from "next/link";
import { HelmetMark, Wordmark } from "@/components/Brand";
import { useCommerce } from "@/components/commerce/Commerce";
import { useNow } from "@/lib/clock";
import { RAYA_EDIT, collectionProducts } from "@/lib/collections";
import { demoSellers, formatRM } from "@/lib/demo";
import { SHOW_SLOTS, nextOccurrence, formatSlotTime } from "@/lib/shows";

/**
 * The brands pitch — scopie.io/brands. What a Malaysian business gets when
 * it comes home to Scopie: its own named AI host (yourbrand.ai), a weekly
 * show, the commerce engines, escrow checkout — and the same host embedded
 * on their OWN site, demoed live on this page. No invented numbers: every
 * proof point on this page links to the real thing running today.
 */

const BRAND_LOGOS: [string, string][] = [
  ["hoor", "/brand/hoor-logo.svg"],
  ["sugarbomb", "/brand/sugarbomb-logo.png"],
  ["maelburger", "/brand/mael-logo.webp"],
  ["jomkaki", "/brand/jomkaki-logo.png"],
  ["bina", "/brand/bina-logo.webp"],
  ["benefigs", "/brand/benefigs-logo.svg"],
  ["tropicor", "/brand/tropicor-logo.webp"],
  ["ombakdamai", "/brand/ombak-logo.webp"],
];

const GETS: { title: string; body: string }[] = [
  {
    title: "Your own named host",
    body: "yourbrand.ai answers sizing, stock and price questions live, in BM or English — grounded in your real catalog, never making prices up. The .ai in the name is the disclosure.",
  },
  {
    title: "A weekly show slot",
    body: "Your slot on the droplist, every week — countdowns, calendar reminders that fire from the buyer's own phone, and WhatsApp share built in.",
  },
  {
    title: "The commerce engines",
    body: "Flash drops with a claimed bar, soft-close auctions with proxy bids and pre-bids, one-tap giveaways.",
  },
  {
    title: "Checkout buyers trust",
    body: "FPX, DuitNow and e-wallets, with the buyer's money held until the order arrives. Escrow is the default, not an upsell.",
  },
  {
    title: "Your page and your clips",
    body: "A brand page with your catalog, and your clips in the feed buyers already scroll.",
  },
  {
    title: "An audience that returns",
    body: "SCOP points and streaks reward buyers for turning up to your shows every week.",
  },
];

/** Client-only clock: the shows strip (times shift with the wall-clock). */
function ShowsStrip() {
  const now = useNow(60_000);
  if (now === null) return null;
  return (
    <div className="bp-shows">
      {SHOW_SLOTS.map((s) => {
        const occ = nextOccurrence(s, now);
        return (
          <Link key={s.id} href={`/live/${s.roomId}`} className="bp-show">
            <b>{s.title}</b>
            <span>
              {demoSellers[s.sellerId]?.name} · {s.host}
            </span>
            <em className="num">{occ.state === "live" ? "Live now" : formatSlotTime(occ)}</em>
          </Link>
        );
      })}
    </div>
  );
}

export default function BrandsPage() {
  const { openProduct } = useCommerce();
  const raya = collectionProducts(RAYA_EDIT).slice(0, 6);

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
      <section className="bp-hero">
        <p className="sec-label">For Malaysian brands</p>
        <h1>
          Your brand. Your show.
          <br />
          Your host — <span className="brand-name">yourbrand.ai</span>
        </h1>
        <p className="lp-sub" style={{ margin: "0 auto" }}>
          Scopie gives every business its own named AI host, a weekly live show, and commerce built for how
          Malaysia actually buys — drops, auctions, giveaways, escrow. It&rsquo;s running today: tap anything
          below.
        </p>
        <div className="lp-cta-row" style={{ justifyContent: "center" }}>
          <Link href="/live/room_hoor" className="btn btn-primary" style={{ width: "auto" }}>
            See hoor.ai live
          </Link>
          <a href="mailto:sales@nexovadigital.com?subject=Put%20my%20brand%20on%20Scopie" className="lp-ghost-btn">
            Talk to the team
          </a>
        </div>
        <div className="lp-host-family" style={{ justifyContent: "center" }} aria-hidden="true">
          {["hoor.ai", "kalima.ai", "sugarbomb.ai", "maelburger.ai", "yourbrand.ai"].map((h) => (
            <span key={h} className={`scopie-chip scopie-chip--ink${h === "yourbrand.ai" ? " bp-you" : ""}`}>
              <HelmetMark size={15} />
              {h}
            </span>
          ))}
        </div>
      </section>

      {/* what you get */}
      <section className="bp-gets">
        <h2 style={{ textAlign: "center" }}>What a brand gets. All of it live today.</h2>
        <div className="bp-get-grid">
          {GETS.map((g) => (
            <div key={g.title} className="bp-get">
              <b>{g.title}</b>
              <p>{g.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* the embed — live, not a mock */}
      <section className="bp-embed">
        <div>
          <p className="sec-label">White-label</p>
          <h2>Your host works on your site too.</h2>
          <p className="lp-sub">
            One line of HTML puts your named host on your own storefront — same catalog, same disclosure.
            The widget on the right is live: ask it something.
          </p>
          <code className="bp-code">&lt;iframe src=&quot;https://scopie.io/embed/hoor&quot; /&gt;</code>
        </div>
        <div className="bp-browser" aria-label="hoor.ai embedded on a brand's own site — live demo">
          <div className="bp-browser-bar" aria-hidden="true">
            <span className="bp-dot" />
            <span className="bp-dot" />
            <span className="bp-dot" />
            <span className="bp-url">hoor.my — your site, your host</span>
          </div>
          <iframe className="bp-frame" src="/embed/hoor" title="hoor.ai — live embedded host demo" loading="lazy" />
        </div>
      </section>

      {/* the raya edit */}
      <section className="bp-raya">
        <p className="sec-label" style={{ textAlign: "center" }}>Seasonal edits</p>
        <h2 style={{ textAlign: "center" }}>{RAYA_EDIT.title}</h2>
        <p className="lp-sub" style={{ margin: "0 auto", textAlign: "center" }}>
          {RAYA_EDIT.tagline} Cross-brand edits put your products into the seasons Malaysians already shop
          for.
        </p>
        <div className="bp-raya-rail" role="group" aria-label="The Raya Edit">
          {raya.map((p) => (
            <button key={p.id} className="bp-raya-card" onClick={() => openProduct(p, "search")}>
              {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
              <span className="bp-raya-body">
                <b>{p.title}</b>
                <em>{formatRM(p.priceSen)}</em>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* the ritual, as proof */}
      <section className="bp-ritual">
        <h2 style={{ textAlign: "center" }}>The week already runs on shows.</h2>
        <ShowsStrip />
      </section>

      {/* brand wall */}
      <section className="lp-brands">
        <p className="sec-label" style={{ textAlign: "center" }}>In good company</p>
        <div className="lp-brand-wall">
          {BRAND_LOGOS.map(([id, src]) => (
            <span key={id} className="lp-brand-tile" title={demoSellers[id]?.name}>
              <img src={src} alt={demoSellers[id]?.name ?? id} loading="lazy" />
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bp-cta">
        <h2>Put your brand on Scopie.</h2>
        <p className="lp-sub" style={{ margin: "0 auto" }}>
          For the first cohort we migrate your catalog, name your host, and book your first show.
        </p>
        <div className="lp-cta-row" style={{ justifyContent: "center" }}>
          <a
            href="mailto:sales@nexovadigital.com?subject=Put%20my%20brand%20on%20Scopie&body=Brand%3A%0AWebsite%20or%20IG%3A%0AWhat%20we%20sell%3A"
            className="btn btn-primary"
            style={{ width: "auto" }}
          >
            Talk to the team
          </a>
          <Link href="/sell" className="lp-ghost-btn">
            Explore the Seller Centre
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
          <Link href="/welcome">What is Scopie</Link>
          <Link href="/?panel=shows">Droplist</Link>
        </nav>
        <span className="lp-copy">© 2026 Scopie · Built in Malaysia</span>
      </footer>
    </main>
  );
}
