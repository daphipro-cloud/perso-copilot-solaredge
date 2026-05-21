-- SolarEdge cloud storage schema (PostgreSQL)
-- Designed for Supabase/Neon free tiers.

create table if not exists energy_intervals (
    id bigserial primary key,
    site_id text not null,
    interval_start timestamptz not null,
    interval_end timestamptz not null,
    time_unit text not null,
    production_kwh numeric(12, 4) not null default 0,
    consumption_kwh numeric(12, 4) not null default 0,
    import_kwh numeric(12, 4) not null default 0,
    export_kwh numeric(12, 4) not null default 0,
    self_consumption_kwh numeric(12, 4) not null default 0,
    raw_payload jsonb,
    ingested_at timestamptz not null default now(),
    unique (site_id, interval_start, interval_end, time_unit)
);

create index if not exists idx_energy_intervals_site_time
    on energy_intervals (site_id, interval_start desc);

create table if not exists energy_daily_agg (
    id bigserial primary key,
    site_id text not null,
    day date not null,
    production_kwh numeric(12, 4) not null default 0,
    consumption_kwh numeric(12, 4) not null default 0,
    import_kwh numeric(12, 4) not null default 0,
    export_kwh numeric(12, 4) not null default 0,
    self_consumption_kwh numeric(12, 4) not null default 0,
    self_consumption_rate numeric(7, 3) not null default 0,
    refreshed_at timestamptz not null default now(),
    unique (site_id, day)
);

create index if not exists idx_energy_daily_agg_site_day
    on energy_daily_agg (site_id, day desc);

create table if not exists sync_checkpoints (
    id bigserial primary key,
    site_id text not null,
    stream_name text not null,
    last_success_end timestamptz,
    last_attempt_at timestamptz,
    last_error text,
    updated_at timestamptz not null default now(),
    unique (site_id, stream_name)
);

create table if not exists sync_runs (
    id bigserial primary key,
    site_id text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null,
    requested_start timestamptz,
    requested_end timestamptz,
    time_unit text,
    points_read integer not null default 0,
    points_written integer not null default 0,
    error_message text,
    metadata jsonb
);
