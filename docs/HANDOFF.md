# Scopie front-end → backend handoff

_Written at the close of the Showtime plan (weeks 1–6), September 2026. The
front end is feature-complete for launch; every commerce mechanic runs today
as a clearly-labeled client-side simulation ("Rehearsal tier"). This document
is the contract for replacing those simulations with real services without
touching the UI._

---

## 1. The one-paragraph state of the world

`apps/web` is a Next.js 15 App Router PWA (deployed on Vercel from `main`,
live at scopie.io). It runs **with zero backend**: when no API is configured,
every surface seeds synchronously from client data and every interactive
mechanic (drops, auctions, giveaways, shows, SCOP, chat) is a **pure function
of wall-clock time + deterministic seeds + localStorage**, so state is
identical across devices and immutable across refreshes. Everything simulated
is labeled **Rehearsal** in the UI (Whatnot's own term). Your job is to make
the label come off — the front end already speaks to the API endpoints listed
in §5 and degrades to demo on any failure, so services can land one at a
time.

## 2. Repo map

```
apps/web            the PWA (this handoff's subject)
  src/app           routes: / (the one surface), /live/[roomId], /welcome,
                    /brands, /embed/[sellerId], /sell, /auth, /c/[handle],
                    /studio, /pay/return
  src/components    surface/ (panels, corner nav), live/ (drop/auction/
                    giveaway blocks + LiveResult), embed/ (HostWidget),
                    commerce/ (product sheet, cart, Scopie Pay confirm)
  src/lib           the Rehearsal engines + client stores (see §4)
packages/core       shared zod types (Product, LiveRoom, Video, engagement
                    events). Rebuild with `npx tsc -p tsconfig.json` inside
                    packages/core after edits.
apps/api            the backend workspace — yours; the web app never imports
                    from it.
```

**DEMO_MODE** (`src/lib/api.ts`): `API_BASE` = `NEXT_PUBLIC_API_URL`, else
`http://localhost:4000` in dev, else `""` in prod. `DEMO_MODE = API_BASE ===
""` — in that state no network call is ever attempted. With an API configured,
every fetch has a 4 s timeout and a demo fallback; the live room degrades to
the labeled sample loop after 3 failed loads. **Setting `NEXT_PUBLIC_API_URL`
in Vercel is the only switch you need to flip.**

## 3. Non-negotiable product rules (encoded in the UI — keep them server-side)

1. **Named hosts:** every business's AI host is named `<business>.ai`
   (hoor.ai, kalima.ai, …; `src/lib/hosts.ts`). The name IS the disclosure.
   API rooms/shows/sellers must carry a host name field following this rule.
2. **No invented prices.** Prices come from the catalog. A merchant without a
   genuine sale pair never shows a discount (drops at list price = honest
   scarcity). `enquiryOnly` products show "price on request", never RM 0.
3. **Simulated commerce is labeled** — the Rehearsal chip — and the
   disclosure travels **inside** share texts and share-card pixels.
4. **The buyer's tap is the authorization.** The cart is a proposal; nothing
   charges without the Scopie Pay confirmation. Escrow (money held until
   delivery) is the promised default.
5. **The payment provider's name never appears in `apps/web`.** White-label
   only.
6. **Timezones:** all ritual times are Malaysia time (UTC+8, no DST) computed
   from epoch math — never `Date` locale methods.

## 4. The Rehearsal engines → the services that replace them

Each engine's client shape is the API contract the UI already renders. Keep
response shapes close to these and the swap is mechanical.

### 4.1 Shows (`lib/shows.ts`)
Weekly slots (`SHOW_SLOTS`): id, title, host (`<business>.ai`), sellerId,
weekday/hour/minute in MYT, durationMin, lineup (product ids), roomId,
poster. `nextOccurrence()` resolves absolute epoch start/end.
**Replace with** `GET /v1/shows` returning occurrences with absolute epoch
ms. Reminders are push-server-free (`lib/reminders.ts` generates .ics with a
VALARM + Google Calendar URL + wa.me links) — keep them even after push
lands.

### 4.2 Flash drops (`lib/drops.ts`)
10-min cycles (idle 2m → pre 1m → live 5m → ended 2m) derived purely from
epoch math; seeded claimed-count simulation; user claims persisted at
`scopie_drop_claims`. Card: quantity-first headline, claimed bar, deal price
only where a genuine pair exists (Sugarbomb 45.90→39.90).
**Replace with** server-authoritative drop state:
`{ productId, phase, startAt, endAt, stock, claimed, dealPriceSen }` +
`POST /v1/drops/:id/claim` (FCFS, idempotent per user). **Invariant: `startAt`
and `endAt` are immutable within a cycle** — a refresh can never reset a
countdown, a price can never linger past its window.

### 4.3 Auctions (`lib/auction.ts`, `components/live/AuctionBlock.tsx`)
Deterministic replay: seeded rival bids merged with the user's persisted bids
(`scopie_auction_bids`). Mechanics verified against primary sources:
- **Soft close:** a bid with <10 s left resets the clock to 10 s (Whatnot's
  counter-bid rule), hard-capped at +120 s so a lot always ends.
- **Proxy (eBay's automatic bidding):** user sets a max; engine bids the
  minimum needed; **winner pays rival-top + one increment; an equal max goes
  to the earlier bid**; the max is private.
- **Increment ladder (ours, shown on the card):** <RM25 → RM1, <RM100 → RM5,
  <RM250 → RM10, ≥RM250 → RM25.
- **Pre-bids** (`scopie_prebids`, armed on the droplist) are a max bid
  auto-applied when the lot opens — Whatnot's own Pre-Bid semantics.
**Replace with** an auction service (WebSocket or 1 s poll) exposing
`{ lotId, phase, startAt, endAt, priceSen, nextBidSen, leaderIsYou,
leaderName, bidCount, userMaxSen }` + `POST /v1/auctions/:id/bid { maxSen }`.
Keep the resolution rules above exactly — the UI copy promises them
("Scopie bids the minimum needed — up to your max, never past it").

### 4.4 Giveaways (`lib/giveaway.ts`)
Open window → drawing → announced; free one-tap entry
(`scopie_giveaway_entries`), **monotone** entry counter, winner drawn from
the cycle seed. **Replace with** `POST /v1/giveaways/:id/enter` + state
polling. Server rules to keep: one entry per user, free, winner announced in
the room. (Real giveaways need real compliance: NO PURCHASE NECESSARY rules,
odds, region limits — flag for legal before launch.)

### 4.5 SCOP + streaks (`lib/scop.ts`)
Earned points with per-key dedupe: check-in 5, attend 10, drop claim 15,
auction win 25, giveaway enter/win 5/20, share 5, pre-bid 5. Streaks are
consecutive **MYT days**. Stored at `scopie_scop` / `scopie_days`; the
profile renders balance, streak, ledger. The real-mode path already calls
`GET /v1/wallet/me` → `{ scopCredits }`. **Replace with** a wallet ledger
service using the same award kinds + dedupe keys (cycle ids, day stamps).
On first sign-in, **merge the local ledger** into the account.

### 4.6 Hosts + chat brains
- Room chat (real mode) already runs on
  `GET/POST /v1/live/rooms/:id/chat` with a 5 s poll and id-dedupe.
- The demo host brain (`demoHostReply` in `lib/demo.ts`) and the embed
  widget's seller-scoped brain (`components/embed/HostWidget.tsx`) encode the
  grounding rules the real LLM host must keep: answer price/size/delivery
  from the catalog only; `enquiryOnly` → "quoted per order"; never a number
  the catalog doesn't hold; identity is `<business>.ai`.
- `/embed/[sellerId]` serves the widget bare for iframing on merchant sites
  (noindex). It needs: the seller's catalog + a chat endpoint scoped to that
  seller.

### 4.7 Live video
Real mode: `POST /v1/live/token` → LiveKit viewer connect (subscribe-only),
with a 12 s no-video watchdog and retry-while-fallback logic already in
`app/live/[roomId]/page.tsx`. Demo: self-hosted HLS loop. Nothing to change
client-side when real streams exist.

### 4.8 Cart & checkout
Cart is client-side (`scopie_cart`), lines keyed by product id — engine wins
use synthetic ids (`<productId>__drop`, `__auction__<cycleId>`,
`__giveaway__<cycleId>`) so a deal line never merges into a list-price line.
Checkout flows into the Scopie Pay confirmation surface and `/pay/return`.
**Replace with** server carts + your payment/escrow integration (see rule
3.5).

## 5. Endpoints the UI already calls (real mode)

| Call | Where | Notes |
| --- | --- | --- |
| `GET /v1/feed?limit=50` | Surface, creator pages | falls back to demo clips |
| `GET /v1/products/picks?limit=N` | Discover | 200 `[]` stays honestly empty |
| `GET /v1/live/rooms` | Surface | live cards woven into the feed |
| `GET /v1/live/rooms/:id` | room page, 10 s poll | 404 = ended; 3 failures → labeled sample |
| `POST /v1/live/token` | room page | LiveKit viewer token |
| `GET/POST /v1/live/rooms/:id/chat` | room page | 5 s poll, id-dedupe, moderation 400s handled |
| `GET /v1/wallet/me` | profile | `{ scopCredits }` |
| auth | `lib/supabase.ts`, `lib/session.ts` | Supabase session; guest preview otherwise |
| `track()` | `lib/events.ts` | engagement enum in `packages/core/src/events.ts` (`video.*`, `live.join/leave/chat/pin_tap/like`, …); no-op in demo |

## 6. localStorage inventory (migrates to account state)

| Key | Owner | Contents |
| --- | --- | --- |
| `scopie_cart` | cart | cart lines (proposal only) |
| `scopie_drop_claims` | drops | claimed cycles |
| `scopie_auction_bids` | auctions | user bid tape per cycle |
| `scopie_prebids` | auctions | armed pre-bid max per room |
| `scopie_giveaway_entries` | giveaways | entered cycle ids |
| `scopie_wins_handled` | wins | idempotence for win→cart commits |
| `scopie_scop` / `scopie_days` | SCOP | ledger + streak days |
| `scopie_follows` / `scopie_comments` | social | device-local graph |
| `scopie_welcomed` | gate | first-run welcome |
| `scopie_anon_id` | identity | anonymous analytics id |
| `scopie_demo_seller` / `_products` / `_shipped` / `_myvideos` | seller/create demos | demo-only, discard |
| `scopie_feed_at` (session) | feed | resume position |

All reads are try/catch-wrapped (private mode safe). On sign-in, merge what
maps to account state (cart, SCOP, follows, claims) and discard demo-only
keys.

## 7. Demo & pitch controls (safe to keep)

Phase-pinning query params, demo only, anchored to mount:
`/live/room_scopie_live?drop=pre|live|ended`,
`/live/room_hoor?auction=preview|live|sold`,
`/live/room_mael?giveaway=open|drawing|done`.
One commerce mechanic per room: scopie_live = drop, hoor + kalima = auction,
mael = giveaway.

## 8. Known deferred items

- LiveResult dialog: Escape/initial-focus/scrim-dismiss are in; a full focus
  trap (Tab-cycling) is not.
- Auction "sudden death" mode (Whatnot's no-extension variant): not built.
- Share cards use the Web Share API with files on mobile; desktop falls back
  to a wa.me text link.
- `:has()` chat-tightening has an `@supports` fallback (fixed 17dvh cap) for
  legacy browsers.
- Match scores are curated (labeled in the UI) until personalization exists.

## 9. Build & deploy notes

- `pnpm` workspace; on the founder's machine set
  `$env:COREPACK_INTEGRITY_KEYS='0'` before pnpm installs (stale corepack
  keys on Node 20).
- `pnpm --filter @scopie/web run build`; Vercel auto-deploys `main`.
- Typecheck: `npx tsc -p apps/web/tsconfig.json --noEmit`.
- After editing `packages/core`: rebuild it, then the app.
- Local prod preview runs on port 3100 (`.claude/launch.json`,
  `scopie-web-prod`).
