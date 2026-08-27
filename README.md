# Scopie

AI-avatar social commerce for Malaysia. Web-first MVP: a PWA at **scopie.io**
that installs on iOS and Android from the browser — feed, discover, live
shopping with an AI host, an AI personal shopper, and a seller marketplace.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design and the
reasoning behind every choice.

## Layout

```
apps/
  web/          Next.js PWA (scopie.io) — feed, discover, live, shop, profile
  api/          NestJS core API — feed, events, live tokens, payments, wallet, agents
  worker/       BullMQ workers — counters, payment reconciliation
  live-agent/   Python LiveKit Agents worker — the AI live-host brain
  commerce/     Medusa v2 + Mercur bootstrap (marketplace system of record)
packages/
  core/         Shared domain types, event taxonomy, payment-gateway port
  db/           SQL migrations (Supabase-compatible)
  mcp/          Scopie Commerce MCP server — the one tool layer all agents use
```

## Quickstart

```bash
pnpm install          # also builds @scopie/core (postinstall)
pnpm dev              # web on :3000 + api on :4000, both in demo mode
```

Demo mode needs **zero infrastructure** — sample catalog, demo feed videos,
scripted AI replies, and a fake checkout. Integrations switch on per the table
below. Copy `.env.example` → `.env` for the api/worker; for the web app,
create `apps/web/.env.local` containing **only the `NEXT_PUBLIC_*` lines**
(server credentials never belong inside `apps/web`, even on disk):

| Feature | Turn on with |
|---|---|
| Events persistence + ledger tables | `DATABASE_URL` (then apply `packages/db/migrations/`). Order/escrow flow additionally needs real UUID identities (auth phase) — demo identities stay in the in-memory demo store. |
| Event pipeline + counters | `REDIS_URL` + `pnpm dev:worker` |
| Product search | `MEILI_HOST` (docker compose provides one) |
| Live viewer tokens (API only) | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — the web player integration is pending; the room page still plays the demo stream |
| Payments (sandbox) | `LEANX_*` credentials + `API_PUBLIC_URL` (server-side only — see below) |
| Marketplace backend | planned — `MEDUSA_URL` is reserved and not read by any code yet (bootstrap per `apps/commerce/README.md`) |

Local infra: `docker compose -f docker-compose.dev.yml up -d` (Postgres,
Redis, Meilisearch).

## Rules of the house

1. **White-label payments.** The payment provider's name must never appear in
   `apps/web` — not in UI strings, not in bundle code, not in URLs the client
   sees. The app knows only "Scopie Pay checkout". The provider lives behind
   the `PaymentGateway` port in `apps/api` and nowhere else.
2. **Money is integer sen.** `ledger_entries` legs sum to zero per
   transaction. `engagement_events` and the ledger are append-only.
3. **No stored RM value.** Buyer money is pass-through at MVP (BNM e-money
   policy). SCOP credits are earned-only and non-redeemable.
4. **Agents propose, humans confirm.** No agent path executes payment; the
   checkout sheet's tap is the authorization.
5. **The AI host is always labeled.** `ai_disclosed` stays true.
