-- Scopie wallet ledger · 0002_wallet
--
-- REGULATORY DESIGN (BNM e-money Policy Document, in force 31 Jan 2025):
--   * Scopie holds NO stored RM value at MVP. Buyer money moves pass-through
--     via the licensed gateway; this ledger RECORDS positions, it is not a purse.
--   * SCOP credits are EARNED-ONLY, non-redeemable loyalty credits (exempt
--     as loyalty points; also exempt from Google Play Billing as awarded points).
--   * The schema is double-entry so balances can migrate to a licensed EMI
--     partner (or Blnk) later without a data-model rewrite.

-- Account kinds (every txn's legs sum to zero per currency):
--   external:gateway       the world outside Scopie (money in/out via the PSP)
--   platform:fees          Scopie commission earned (RM)
--   escrow:<order_id>      per-order hold between payment and delivery (RM)
--   seller:<profile_id>    seller payable balance (RM)
--   scop:<profile_id>      earned SCOP credits (integer credits, not money)
--   scop:pool              SCOP issuance pool
--
-- Example flows:
--   payment ok:   external:gateway −A          escrow:<order> +A
--   release:      escrow:<order>  −A           seller:<id> +(A−fee)   platform:fees +fee
--   refund:       escrow:<order>  −A           external:gateway +A
--   payout:       seller:<id>     −A           external:gateway +A
--   scop grant:   scop:pool       −C           scop:<user> +C

create table if not exists ledger_accounts (
  id text primary key,                    -- e.g. 'seller:7f…', 'escrow:9a…'
  kind text not null check (kind in ('external','platform_fees','escrow','seller_payable','scop_user','scop_pool')),
  currency text not null check (currency in ('MYR','SCOP')),
  created_at timestamptz not null default now()
);

-- Transaction headers give the ledger database-level idempotency: one
-- business event (ref_type, ref_id) can only ever post once.
create table if not exists ledger_txns (
  txn_id uuid primary key,
  ref_type text not null,
  ref_id text not null,
  created_at timestamptz not null default now(),
  unique (ref_type, ref_id)
);

create table if not exists ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null,                   -- groups the legs of one transaction
  account_id text not null references ledger_accounts(id),
  -- signed integer sen (MYR) or whole credits (SCOP); sum(amount) per txn_id must be 0
  amount bigint not null,
  currency text not null check (currency in ('MYR','SCOP')),
  ref_type text not null check (ref_type in ('order_payment','order_release','refund','payout','commission','scop_grant','scop_burn','adjustment')),
  ref_id text not null,                   -- order id / payout id / grant reason
  created_at timestamptz not null default now()
);
create index if not exists ledger_txn_idx on ledger_entries (txn_id);
create index if not exists ledger_account_idx on ledger_entries (account_id, id desc);

-- Zero-sum invariant enforced at the database, not just the service layer:
-- a deferred constraint trigger rejects any commit whose txn legs don't
-- balance per currency.
create or replace function check_txn_balanced() returns trigger as $$
declare bad int;
begin
  select count(*) into bad from (
    select currency from ledger_entries where txn_id = new.txn_id
    group by currency having sum(amount) <> 0
  ) unbalanced;
  if bad > 0 then
    raise exception 'unbalanced ledger txn %', new.txn_id;
  end if;
  return null;
end $$ language plpgsql;

drop trigger if exists ledger_txn_balanced on ledger_entries;
create constraint trigger ledger_txn_balanced
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function check_txn_balanced();

-- Balances are always derived: sum(amount) over entries. A materialized
-- balance table can be added later; never store a mutable balance column.

create or replace view ledger_balances as
  select account_id, currency, sum(amount)::bigint as balance
  from ledger_entries
  group by account_id, currency;

-- SCOP grant reasons are enumerated so "earned-only" is enforceable in review.
create table if not exists scop_grant_rules (
  reason text primary key,                -- 'signup', 'first_order', 'daily_checkin', 'referral_qualified'
  credits int not null check (credits > 0),
  active boolean not null default true
);

insert into scop_grant_rules (reason, credits) values
  ('signup', 50),
  ('first_order', 100),
  ('daily_checkin', 5),
  ('referral_qualified', 150)
on conflict (reason) do nothing;
