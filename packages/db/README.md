# @scopie/db

SQL migrations for the Scopie Postgres schema. Runs on Supabase (production)
and plain Postgres (local dev via `docker-compose.dev.yml`).

## Apply locally

```bash
psql postgres://scopie:scopie@localhost:5432/scopie -f migrations/0001_init.sql
psql postgres://scopie:scopie@localhost:5432/scopie -f migrations/0002_wallet.sql
```

## Apply to Supabase

Use the Supabase CLI (`supabase db push`) or paste migrations into the SQL
editor. On Supabase, add RLS policies before exposing tables to the client:

- `profiles`, `follows`, `comments`: user can insert/update own rows; read is public.
- `engagement_events`: **insert-only** for authenticated users (and anon key with
  rate limits); no select for clients; no update/delete for anyone.
- `videos`: creators manage own rows; public read of `status='ready'` and
  `moderation_state='approved'` only.
- `orders_ref`, `ledger_*`, `moderation_log`: **service-role only** — never
  exposed to the client. All access goes through the API.

## Rules that keep audits painless

1. `engagement_events` and `ledger_entries` are append-only. No exceptions.
2. Money is integer sen. SCOP is integer credits. No floats, ever.
3. Every ledger transaction's legs sum to zero per `txn_id` — enforce in the
   service layer (`WalletService.post()`), verify nightly in the worker.
4. `moderation_log.reason` is mandatory prose — it is the MCMC audit trail.
