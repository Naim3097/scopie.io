-- Scopie marketplace · 0004_marketplace
--
-- Sellers, a Scopie-side catalog, and the order-fulfillment columns that the
-- escrow-release flow needs. In Medusa+Mercur mode, Medusa is the system of
-- record for products/orders and catalog_products is a read cache kept in
-- sync; in DB mode (no Medusa) it is the authoritative store.
--
-- Runs on BOTH plain Postgres and Supabase: the tables/columns apply
-- everywhere; the RLS/grant section at the bottom self-guards (executes only
-- when the auth schema and the authenticated role exist).

-- ── sellers ─────────────────────────────────────────────────────────
-- A seller IS a profile that opted in. is_seller on profiles is a
-- denormalized hint; the authority is this row plus status='active'.
create table if not exists sellers (
  id uuid primary key references profiles(id) on delete cascade,
  shop_name text not null,
  status text not null default 'active' check (status in ('pending','active','suspended')),
  -- Per-seller commission; releaseEscrow reads this (fallback 800).
  commission_bps int not null default 800 check (commission_bps between 0 and 5000),
  -- Payout destination, verified against the gateway's account-name check at
  -- onboarding. Nullable until the seller adds it. SERVICE-ROLE-ONLY writes:
  -- payout details must always pass the verification path in the API.
  payout_bank_code text,
  payout_account_number text,
  payout_account_holder text,
  medusa_vendor_id text,                  -- Mercur vendor id when on Medusa
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── catalog ─────────────────────────────────────────────────────────
create table if not exists catalog_products (
  id text primary key,                    -- medusa product id, or generated in demo mode
  seller_id uuid not null references sellers(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  variant text,
  price_sen bigint not null check (price_sen >= 1),
  currency text not null default 'MYR',
  image_url text,
  status text not null default 'active' check (status in ('draft','active','archived')),
  -- Calibrated similarity for "AI Picks"; SERVER-COMPUTED ONLY (see RLS
  -- below — clients must never write their own ranking badge).
  match_score int check (match_score between 0 and 100),
  tags text[] not null default '{}',
  stock int not null default 100 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists catalog_seller_idx on catalog_products (seller_id, created_at desc);
create index if not exists catalog_status_idx on catalog_products (status) where status = 'active';
create index if not exists catalog_tags_idx on catalog_products using gin (tags);

-- ── order fulfillment additions ─────────────────────────────────────
alter table orders_ref add column if not exists shipped_at timestamptz;
alter table orders_ref add column if not exists delivered_at timestamptz;
alter table orders_ref add column if not exists tracking_ref text;

-- ── RLS + grants (Supabase only — self-guarded) ────────────────────
-- The API uses the service role (bypasses RLS); these govern any direct
-- PostgREST access. On plain Postgres (no auth schema / authenticated role)
-- this block is a no-op, so the file applies cleanly everywhere.
do $rls$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '0004: plain Postgres detected — skipping RLS/grants (Supabase only)';
    return;
  end if;

  execute 'alter table sellers enable row level security';
  execute 'alter table catalog_products enable row level security';

  -- Active products are publicly readable; sellers additionally see their own.
  execute 'drop policy if exists "active products readable" on catalog_products';
  execute 'create policy "active products readable" on catalog_products for select using (status = ''active'')';
  execute 'drop policy if exists "sellers read own products" on catalog_products';
  execute 'create policy "sellers read own products" on catalog_products for select using (auth.uid() = seller_id)';
  execute 'drop policy if exists "sellers write own products" on catalog_products';
  execute 'create policy "sellers write own products" on catalog_products for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id)';

  -- Trust-column discipline (same class as profiles in 0003): match_score is
  -- the AI-calibrated ranking badge — a seller must not be able to self-pin
  -- to the top of AI Picks via PostgREST. Column-scope the writes.
  execute 'revoke insert, update on catalog_products from authenticated';
  execute 'grant insert (id, seller_id, title, variant, price_sen, currency, image_url, status, tags, stock) on catalog_products to authenticated';
  execute 'grant update (title, variant, price_sen, image_url, status, tags, stock) on catalog_products to authenticated';

  execute 'drop policy if exists "sellers read own shop" on sellers';
  execute 'create policy "sellers read own shop" on sellers for select using (auth.uid() = id)';
  -- Sellers may self-edit ONLY the shop name via PostgREST. Payout details
  -- and commission/status are service-role-only: payout destinations must
  -- always pass the API''s gateway account-name verification.
  execute 'drop policy if exists "sellers update own shop" on sellers';
  execute 'create policy "sellers update own shop" on sellers for update using (auth.uid() = id) with check (auth.uid() = id)';
  execute 'revoke insert, update on sellers from authenticated';
  execute 'grant update (shop_name) on sellers to authenticated';
end
$rls$;
