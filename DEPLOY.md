# Deploying Scopie

## What goes live now

Vercel hosts **`apps/web`** (the Next.js PWA). With no `NEXT_PUBLIC_API_URL`
set, the build runs in **pure demo mode** — the same feed, Discover, Live
room, AI shopper, and demo checkout you see locally, with zero backend calls.
The NestJS API, worker, and commerce backend deploy later (Railway/Fly
Singapore per `ARCHITECTURE.md`); when they exist, setting one env var
switches the live site from demo to real.

## 1 · Vercel setup

1. vercel.com → **Add New → Project** → import `Naim3097/scopie.io` from GitHub.
2. In the import screen set:
   - **Root Directory**: `apps/web`  ← the one setting that matters
   - Framework Preset: Next.js (auto-detected)
   - Build command / install command: leave defaults (Vercel detects pnpm
     from the root `packageManager` field and installs the whole workspace;
     the root `postinstall` builds `@scopie/core` before `next build`).
3. Environment variables: **none needed** for the demo deployment.
   Later, when the API is hosted: add `NEXT_PUBLIC_API_URL=https://api.scopie.io`.
4. Deploy. You get `scopie-io-<hash>.vercel.app` — verify `/feed` plays.

## 2 · Point scopie.io from Hostinger

In the Vercel project → **Settings → Domains** → add `scopie.io` and
`www.scopie.io`. Vercel shows the DNS records it expects. Then in Hostinger
**hPanel → Domains → scopie.io → DNS / Name Servers**, pick ONE of:

**Option A — keep Hostinger DNS (recommended, keeps your email/records):**
In the DNS Zone editor:

| Type  | Name | Value                  |
|-------|------|------------------------|
| A     | @    | `76.76.21.21`          |
| CNAME | www  | `cname.vercel-dns.com` |

Delete any conflicting old A/AAAA/CNAME records for `@` and `www` first
(Hostinger parking records). Use the exact values Vercel's Domains screen
shows if they differ.

**Option B — delegate to Vercel DNS:**
Change nameservers to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`.
(Only if nothing else — email, subdomains — depends on Hostinger DNS.)

Propagation is usually minutes, up to ~24 h. Vercel provisions HTTPS
automatically once the records resolve. Set `scopie.io` as the primary domain
and let `www` redirect to it.

## 3 · Post-deploy checks

- `https://scopie.io/feed` — vertical feed plays (muted autoplay).
- Phone install: iOS Safari → Share → **Add to Home Screen** (icon should be
  the Scopie mark); Android Chrome → **Install app**.
- `/discover` → "Buy with Scopie Pay" → demo checkout → "Demo checkout
  complete" page.
- View source: no payment-provider names anywhere.

## Later phases (not on Vercel)

| Service | Where | Trigger |
|---|---|---|
| `apps/api` + `apps/worker` | Railway / Fly.io (Singapore) | first real data; then set `NEXT_PUBLIC_API_URL` + CORS `WEB_ORIGIN` |
| Postgres / Auth / Realtime | Supabase (ap-southeast-1) | with the API |
| `apps/commerce` (Medusa+Mercur) | Railway / Fly.io | seller onboarding |
| `apps/live-agent` | GPU-less VM / Fly machine | Scopie Live GA |

Keep `api.scopie.io` as a subdomain in the same Hostinger DNS zone (CNAME to
the API host) when that day comes.
