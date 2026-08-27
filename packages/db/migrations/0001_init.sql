-- Scopie core schema · 0001_init
-- Supabase-compatible (auth.users assumed when running on Supabase; plain
-- Postgres in local dev — profiles.id is then free-standing).
-- Money is integer sen (MYR cents) everywhere. No floats near money.

create extension if not exists pgcrypto;

-- ── identity ────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null check (handle ~ '^[a-z0-9_\.]{3,30}$'),
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  -- Avatar ID: verification is a status, minting consent is a record.
  verification_status text not null default 'none'
    check (verification_status in ('none','pending','verified')),
  likeness_consent_at timestamptz,        -- set when the user consents to AI likeness use
  is_seller boolean not null default false,
  -- Online Safety Act / MCMC: under-13 gating from day one.
  birth_year int,
  created_at timestamptz not null default now()
);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on follows (followee_id);

-- ── videos ──────────────────────────────────────────────────────────
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  caption text not null default '',
  -- Cloudflare Stream identifiers; playback is HLS.
  cf_stream_uid text,
  hls_url text,
  poster_url text,
  duration_ms int,
  status text not null default 'processing'
    check (status in ('processing','ready','blocked','removed')),
  moderation_state text not null default 'pending'
    check (moderation_state in ('pending','approved','flagged','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists videos_creator_idx on videos (creator_id, created_at desc);

create table if not exists video_hashtags (
  video_id uuid not null references videos(id) on delete cascade,
  tag text not null,
  primary key (video_id, tag)
);
create index if not exists video_hashtags_tag_idx on video_hashtags (tag);

create table if not exists video_products (
  video_id uuid not null references videos(id) on delete cascade,
  product_id text not null,               -- Medusa product id (external system of record)
  primary key (video_id, product_id)
);

-- Denormalized counters, maintained by the worker (never by clients).
create table if not exists video_stats (
  video_id uuid primary key references videos(id) on delete cascade,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  views bigint not null default 0,
  watch_ms_total bigint not null default 0
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 500),
  moderation_state text not null default 'approved'
    check (moderation_state in ('approved','flagged','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists comments_video_idx on comments (video_id, created_at desc);

-- ── the events table (append-only; feeds every recommender) ────────
create table if not exists engagement_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  user_id text not null,                  -- uuid or 'anon:<device>'
  subject_id text not null,
  watch_ms int,
  duration_ms int,
  surface text not null default 'feed',
  client_ts timestamptz,
  received_at timestamptz not null default now(),
  meta jsonb
);
-- Append-only: no update/delete grants. Partition by month before scale.
create index if not exists events_user_idx on engagement_events (user_id, received_at desc);
create index if not exists events_subject_idx on engagement_events (subject_id, event_type);

-- ── live commerce ───────────────────────────────────────────────────
create table if not exists live_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id),
  host_type text not null default 'seller' check (host_type in ('seller','ai')),
  ai_disclosed boolean not null default true,   -- AI hosts are always labeled
  title text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','live','ended')),
  livekit_room text,
  hls_playback_url text,                  -- set when the room is egressed to CDN
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Everything that happens on the overlay: pins, deals, host answers.
-- Synced to stream position (not wall clock) so HLS viewers stay coherent.
create table if not exists live_room_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references live_rooms(id) on delete cascade,
  kind text not null check (kind in ('pin_product','unpin','flash_deal_start','flash_deal_end','host_answer')),
  payload jsonb not null,
  stream_ms bigint,                       -- position on the stream timeline
  created_at timestamptz not null default now()
);
create index if not exists live_room_events_room_idx on live_room_events (room_id, id);

-- ── orders (reference; Medusa is the commerce system of record) ────
create table if not exists orders_ref (
  id uuid primary key default gen_random_uuid(),
  medusa_order_id text unique,
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  -- What was bought: the recommender's purchase event joins on product_id.
  product_id text,
  quantity int not null default 1 check (quantity > 0),
  amount_sen bigint not null check (amount_sen >= 0),
  currency text not null default 'MYR',
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','expired','refunded')),
  escrow_released boolean not null default false,
  fulfillment_status text not null default 'unfulfilled'
    check (fulfillment_status in ('unfulfilled','shipped','delivered','disputed','returned')),
  provider_ref text,                      -- gateway reference, server-side only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on orders_ref (buyer_id, created_at desc);
create index if not exists orders_seller_idx on orders_ref (seller_id, created_at desc);

-- ── moderation audit (MCMC-shaped from day one) ────────────────────
create table if not exists moderation_log (
  id bigint generated always as identity primary key,
  subject_type text not null check (subject_type in ('video','comment','profile','live_room','product')),
  subject_id text not null,
  action text not null check (action in ('flagged','approved','removed','age_restricted','appeal_upheld','appeal_denied')),
  reason text not null,                   -- auditable justification (regulatory requirement)
  actor text not null default 'system',   -- 'system', 'model:<name>' or moderator profile id
  created_at timestamptz not null default now()
);
create index if not exists moderation_subject_idx on moderation_log (subject_type, subject_id);
