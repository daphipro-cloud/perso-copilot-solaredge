-- Adds parity table for 1:1 comparison with SolarEdge monitoring power CSV exports.
-- Safe to run multiple times.

create table if not exists power_intervals (
    id bigserial primary key,
    site_id text not null,
    interval_start timestamptz not null,
    interval_end timestamptz not null,
    time_unit text not null,
    production_kw numeric(12, 4) not null default 0,
    to_building_kw numeric(12, 4) not null default 0,
    to_grid_kw numeric(12, 4) not null default 0,
    consumption_kw numeric(12, 4) not null default 0,
    from_pv_kw numeric(12, 4) not null default 0,
    from_grid_kw numeric(12, 4) not null default 0,
    raw_payload jsonb,
    ingested_at timestamptz not null default now(),
    unique (site_id, interval_start, interval_end, time_unit)
);

create index if not exists idx_power_intervals_site_time
    on power_intervals (site_id, interval_start desc);
