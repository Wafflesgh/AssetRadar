-- schema.sql — The one table AssetRadar needs in Supabase (Postgres). Run it once in the
-- Supabase SQL editor. The server reads and writes it with the service_role key; row level
-- security is on with no policies, so the public (anon) key cannot read or change anything.
create table if not exists assetradar_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table assetradar_kv enable row level security;
