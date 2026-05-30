-- =============================================================================
-- Run this file in Supabase SQL Editor (Dashboard → SQL → New query).
-- Realtime will NOT fire until the publication + RLS steps below are applied.
-- =============================================================================

-- Incidents table (current Supabase schema)
create table if not exists incidents (
  id bigint generated always as identity primary key,

  title text not null,
  description text,

  latitude double precision not null,
  longitude double precision not null,

  status text default 'i_ri',

  -- detection origin: 'civilian' or 'sensor'
  source text not null,

  -- only used when source = 'sensor'
  sensor_type text,

  created_at timestamptz default timezone('utc'::text, now()) not null,
  resolved_at timestamptz,

  -- AI triage output (populated by POST /api/triage)
  category text,
  priority text,
  ai_summary text,
  teams_needed text[],

  -- macro-incident grouping (null = cluster root; set to primary id when merged)
  cluster_id bigint references incidents (id) on delete set null,

  constraint sensor_type_check check (
    sensor_type is null
    or sensor_type in ('fire_detector', 'hydrosensor', 'seismic_sensor')
  ),

  constraint source_check check (
    source in ('civilian', 'sensor')
  )
);

-- -----------------------------------------------------------------------------
-- Realtime: add table to supabase_realtime publication (required for INSERT events)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table incidents;

-- -----------------------------------------------------------------------------
-- RLS: Realtime postgres_changes only delivers rows the client may SELECT
-- -----------------------------------------------------------------------------
alter table incidents enable row level security;

drop policy if exists incidents_select_anon on public.incidents;
create policy incidents_select_anon
  on public.incidents
  for select
  to anon, authenticated
  using (true);

drop policy if exists incidents_insert_anon on public.incidents;
create policy incidents_insert_anon
  on public.incidents
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists incidents_update_anon on public.incidents;
create policy incidents_update_anon
  on public.incidents
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- If incidents already exists without triage columns, run once in SQL Editor:
-- alter table incidents
--   add column if not exists category text,
--   add column if not exists priority text,
--   add column if not exists ai_summary text,
--   add column if not exists teams_needed text[];
-- alter table incidents add column if not exists cluster_id bigint references incidents (id) on delete set null;
-- alter table incidents add column if not exists resolved_at timestamptz;
