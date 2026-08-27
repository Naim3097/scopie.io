-- Scopie creator uploads · 0005_uploads
-- The videos table shipped in 0001; this adds the upload-pipeline specifics.
-- Runs on both plain Postgres and Supabase.

-- One Stream asset maps to exactly one video row (webhooks are idempotent on it).
create unique index if not exists videos_cf_uid_idx on videos (cf_stream_uid)
  where cf_stream_uid is not null;

-- Feed queries: ready + approved, newest first.
create index if not exists videos_feed_idx on videos (created_at desc)
  where status = 'ready' and moderation_state = 'approved';
