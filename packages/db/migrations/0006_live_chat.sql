-- Live room chat: the viewer side of the AI host loop.
-- Viewer messages land here; AI host answers land here (is_host) AND in
-- live_room_events (kind 'host_answer') as the auditable record of what the
-- AI said. Guests may chat: sender_id is null for guest identities.
create table if not exists live_chat (
  id bigint generated always as identity primary key,
  room_id uuid not null references live_rooms(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  display_name text not null,
  body text not null check (char_length(body) between 1 and 300),
  is_host boolean not null default false,
  -- Server-attached catalog snapshot {id,title,priceSen} for host suggestions.
  product jsonb,
  created_at timestamptz not null default now()
);

create index if not exists live_chat_room_idx on live_chat (room_id, id);

-- Server-only access (the API reads/writes with its own connection).
alter table live_chat enable row level security;
