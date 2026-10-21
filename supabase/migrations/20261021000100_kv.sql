-- 20261021000100_kv.sql — The single key/value table AssetRadar needs (same as supabase/schema.sql), as a Supabase CLI migration.
-- schema.sql — The one table AssetRadar needs in Supabase (Postgres). Run it once in the
-- Supabase SQL editor. The server reads and writes it with the service_role key; row level
-- security is on with no policies, so the public (anon) key cannot read or change anything.
create table if not exists assetradar_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table assetradar_kv enable row level security;

-- Explicit grants, so it works with or without "Automatically expose new tables":
-- only the server key (service_role) may use the table; the public roles get nothing.
revoke all on table assetradar_kv from anon, authenticated;
grant select, insert, update, delete on table assetradar_kv to service_role;
