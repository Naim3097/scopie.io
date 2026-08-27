# Scopie MVP Architecture

Web-first MVP: a PWA served at **scopie.io**, installable on iOS and Android
from the browser. No app store at MVP — which also means no IAP tax on
anything and no store review gating launches. Native (React Native/Expo) is a
later phase that reuses this API unchanged.

Full research behind these choices: see the published stack report
(claude.ai/code artifact "The Scopie Stack", Aug 2026).

```
                       ┌────────────────────────────────────────────┐
                       │        apps/web · Next.js PWA (scopie.io)  │
                       │  Feed · Discover · Live · To Shop · Profile│
                       └──────┬──────────────────────┬──────────────┘
                              │ REST                 │ WebRTC/HLS
                    ┌─────────▼─────────┐   ┌────────▼────────┐
                    │  apps/api (Nest)  │   │ LiveKit rooms    │
                    │ feed events live  │   │ (seller + AI)    │
                    │ payments wallet   │   └────────┬────────┘
                    │ agents            │            │
                    └──┬────┬────┬──────┘   ┌────────▼────────┐
                       │    │    │          │ apps/live-agent │
              ┌────────▼┐ ┌─▼──────────┐    │ (Python, brain) │
              │Postgres │ │ Redis/Bull │    │ + avatar plugin │
              │+ ledger │ │ apps/worker│    └────────┬────────┘
              └─────────┘ └────────────┘    ┌────────▼────────┐
                       │                    │  packages/mcp   │
              ┌────────▼─────────┐          │  commerce tools │
              │ Medusa + Mercur  │◄─────────┴─────────────────┘
              │ (apps/commerce)  │
              └────────┬─────────┘
                       │ PaymentGateway port (server-side only)
              ┌────────▼─────────┐
              │  LeanX adapter    │  ← white-label: invisible to the client
              └──────────────────┘
```

## Why web-first works for this product

- **Video feed**: iOS Safari plays HLS natively; everywhere else `hls.js`.
  The TikTok feel is a client pattern (scroll-snap + IntersectionObserver +
  a SINGLE attached player + stall watchdog), implemented in
  `apps/web/src/components/feed/`. Media never attaches to non-active cards
  — phones allow very few concurrent decoders; preload-ahead returns later
  via a reused player pool, never parallel pipelines.
- **Live**: LiveKit has a first-class web SDK; big audiences get HLS anyway.
- **Payments**: FPX/DuitNow/e-wallet checkouts are redirect/QR flows — born
  for the web. No Apple IAP constraints on web distribution.
- **Install**: PWA manifest + service worker; iOS installs from Share → Add
  to Home Screen. Web Push works on installed iOS PWAs (16.4+).
- The trade: no camera-roll-deep capture UX and weaker push defaults than
  native. Acceptable at MVP; native app is phase 3 reusing this exact API.

## The money flow (the part regulation shapes)

**Constraint 1 — BNM e-money policy (in force 31 Jan 2025):** a reloadable RM
balance would make Scopie an e-money issuer. So at MVP there is **no stored
buyer value**: every purchase is pass-through (buyer → gateway → settlement),
and "Scopie Pay" is the checkout experience, not a purse. SCOP credits are
earned-only, non-redeemable loyalty credits (exempt; also Play-Billing-exempt
as awarded points when native ships).

**Constraint 2 — the gateway has no escrow/split APIs** (verified against
LeanX docs, Aug 2026). So the marketplace mechanics live in **our ledger**
(`packages/db/migrations/0002_wallet.sql` + `WalletService`): double-entry,
integer sen, every transaction's legs sum to zero.

```
payment ok:  external:gateway −A                escrow:<order> +A
delivered:   escrow:<order>  −A                 seller:<id> +(A−fee)   platform:fees +fee
refund:      escrow:<order>  −A                 external:gateway +A
payout:      seller:<id>     −A                 external:gateway +A
scop grant:  scop:pool       −C                 scop:<user> +C
```

**LeanX integration specifics** (server-side only — the provider is
white-labeled; `apps/web` may never contain its name):

- Headless checkout via `create-bill-silent` (returns a direct bank/e-wallet
  `payment_url` + DuitNow QR data we render in our own UI). The provider's
  hosted page (`create-bill-page`) is never used.
- Requests are HMAC-SHA256 signed (`METHOD|UUID|PATH|TS|TOKEN|NONCE` with the
  merchant hash key; `x-signature`/`x-timestamp`/`x-nonce`, 5-min window).
- Webhooks arrive as an HS256 JWT signed with the hash key — verified in
  `LeanXGateway.verifyWebhook`, forgeries rejected. **Callbacks fire on
  success only**, so the API runs a reconciliation loop
  (`PaymentsService.reconcilePending`, 60 s, armed when DB + gateway are
  configured) that drives every open order to a terminal state, plus
  on-demand reconcile when the return page polls order status.
- Payouts: real-time to any MY bank account, with `check-verification-bank`
  name-matching at seller onboarding. Funded from a prefund pool that needs
  balance monitoring (`overall-balance`, error 5993 = insufficient).
- Open commercial items to settle with the provider before launch: split
  payments (marketed, not documented), refunds (no API), Enterprise "FPX Own
  ID" (needed so bank screens show Scopie, not the aggregator), payout sender
  name (currently shows the provider's legal entity to sellers), pool caps,
  and their BNM/acquirer standing in writing. Get Malaysian counsel on the
  payment-facilitator question.

## The event spine

`engagement_events` (append-only) is the single most valuable table:
view/watch/skip/like/share/purchase with watch-ms, written from day one via
`POST /v1/events` (zod-validated batches, sendBeacon on page hide). Every
recommender phase consumes exactly this stream:

- **Phase 0 (now):** heuristic feed — recency × engagement × follow boost.
- **Phase 1:** Gorse (self-hosted, Apache-2.0) or Recombee free tier.
- **Phase 2:** embeddings in pgvector + learned re-ranker.

Counters (`video_stats`) are maintained only by `apps/worker` — clients never
write aggregates.

## Scopie Live

One LiveKit room per show. The seller (or the AI host) publishes WebRTC;
small audiences subscribe directly, large audiences get Egress → Cloudflare
Stream HLS (~$0.06/viewer-hour, 3–6 s latency). Product pins and flash deals
are data events synced to **stream position, never wall clock** —
`live_room_events.stream_ms` exists for exactly this.

The AI host (`apps/live-agent`) is one avatar session per show regardless of
audience size (~$6–12/hour): chat → question ranker → LLM with MCP catalog
tools → BM/EN TTS → HeyGen LiveAvatar via the LiveKit avatar plugin
(swappable for Anam/Tavus/Simli without touching agent logic). Security
invariants are documented in `agent.py` — chat is data, tools are
allowlisted, the API re-validates every command, prices never come from
generated text, and the host is always labeled AI.

## Agents

One internal **Scopie Commerce MCP server** (`packages/mcp`) is the only tool
surface any agent gets: `search_products`, `get_product`, `add_to_cart`,
`get_order_status`. There is deliberately no payment tool — the agent
assembles a cart and hands off to the Scopie Pay confirmation sheet; the
human tap is the authorization. (AP2-style signed mandates are the later
path to bounded autonomous spending.)

## Compliance hooks built in from day one

- `profiles.birth_year` → under-13 gating (Online Safety Act 2024 / MCMC).
- `moderation_log` with mandatory prose reasons → the audit trail the ASP(C)
  regime expects at scale (8M+ MY users).
- `live_rooms.ai_disclosed` → the AI host is always labeled.
- `profiles.likeness_consent_at` → avatar minting binds to consent + eKYC.

## Environments & deployment shape

- **Web**: Vercel or Cloudflare (SG edge). **API/worker**: Railway or Fly.io
  Singapore. **DB/auth/realtime/storage**: Supabase ap-southeast-1.
  **Media**: Cloudflare R2 + Stream. ~10–20 ms from KL/Penang.
- Everything degrades to demo mode with zero env vars — the repo runs on a
  laptop with `pnpm install && pnpm dev`.

## Phase map

| | Now (MVP) | Next | Later |
|---|---|---|---|
| Feed | heuristic + events table | Gorse/Recombee | learned re-ranker |
| Live | seller WebRTC + demo AI room | AI host GA (LiveKit Agents + avatar) | self-hosted MuseTalk rendering |
| Commerce | Medusa+Mercur, pass-through payments | automated payouts, seller KYB | EMI partner, stored value |
| Agents | shopper stub + MCP server | real agent loop, voice (BM/EN) | mandated autonomous buys |
| App | PWA | creator tools, editor SDK | React Native app |
