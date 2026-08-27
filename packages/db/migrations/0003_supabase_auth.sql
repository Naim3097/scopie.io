-- Scopie auth wiring · 0003_supabase_auth
--
-- ⚠ SUPABASE ONLY: references the auth schema. Skip this file on plain
-- local Postgres (the API's ProfilesService.ensure() covers dev there).

-- ── auto-provision a profile for every new auth user ────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_handle text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  candidate text := base_handle;
  attempt int := 0;
begin
  -- `handle` has its OWN unique constraint; on_conflict(id) would NOT catch a
  -- handle collision (48-bit prefix namespace), and an unhandled 23505 here
  -- would abort the auth.users insert → signup fails. Retry with a suffix.
  loop
    begin
      insert into public.profiles (id, handle, display_name)
      values (
        new.id,
        candidate,
        coalesce(nullif(split_part(new.email, '@', 1), ''), 'Scopie user')
      );
      return new;
    exception
      when unique_violation then
        -- Same id (profile already exists) → done. Handle clash → new suffix.
        if exists (select 1 from public.profiles where id = new.id) then
          return new;
        end if;
        attempt := attempt + 1;
        exit when attempt > 5;
        candidate := base_handle || '_' || substr(md5(random()::text || attempt::text), 1, 4);
    end;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── row-level security ──────────────────────────────────────────────
-- The API talks to Postgres with the service role (bypasses RLS); these
-- policies govern any direct client access via Supabase's PostgREST.

alter table profiles enable row level security;
create policy "profiles are publicly readable"
  on profiles for select using (true);
create policy "users update their own profile"
  on profiles for update using (auth.uid() = id);
-- Trust/role columns are SERVER-ONLY. Without this, an authed client hitting
-- PostgREST could PATCH its own row to is_seller=true / verification_status=
-- 'verified' / forge likeness_consent_at. Restrict the authenticated role to
-- presentational columns; service_role (the API) bypasses RLS and keeps full
-- write access.
revoke update on profiles from authenticated;
grant update (handle, display_name, avatar_url, bio) on profiles to authenticated;

alter table follows enable row level security;
create policy "follows are publicly readable"
  on follows for select using (true);
create policy "users manage their own follows"
  on follows for insert with check (auth.uid() = follower_id);
create policy "users remove their own follows"
  on follows for delete using (auth.uid() = follower_id);

-- Server-only tables: RLS on, NO policies → clients see nothing.
alter table engagement_events enable row level security;
alter table orders_ref enable row level security;
alter table ledger_accounts enable row level security;
alter table ledger_entries enable row level security;
alter table ledger_txns enable row level security;
alter table moderation_log enable row level security;
alter table live_room_events enable row level security;

alter table videos enable row level security;
create policy "ready public videos are readable"
  on videos for select using (status = 'ready' and moderation_state = 'approved');

alter table comments enable row level security;
create policy "approved comments are readable"
  on comments for select using (moderation_state = 'approved');
create policy "users write their own comments"
  on comments for insert with check (auth.uid() = author_id);

alter table live_rooms enable row level security;
create policy "live rooms are publicly readable"
  on live_rooms for select using (true);
