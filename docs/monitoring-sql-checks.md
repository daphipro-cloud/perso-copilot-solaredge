# Supabase Monitoring SQL Checks

Run these in Supabase SQL Editor once per week.

## 1. Last successful sync freshness

```sql
select
  max(finished_at) as last_success_utc,
  extract(epoch from (now() - max(finished_at))) / 60 as minutes_since_last_success
from sync_runs
where status = 'success';
```

Pass target:
- minutes_since_last_success should normally be below 90 minutes.

## 2. Failed sync count in last 7 days

```sql
select
  count(*) as failed_runs_7d
from sync_runs
where status <> 'success'
  and started_at >= now() - interval '7 days';
```

Pass target:
- failed_runs_7d should be 0.

## 3. Most recent sync errors (triage view)

```sql
select
  started_at,
  finished_at,
  status,
  left(coalesce(error_message, ''), 240) as error_excerpt
from sync_runs
where status <> 'success'
order by started_at desc
limit 10;
```

Pass target:
- no rows returned.

## 4. Daily ingest volume trend (last 14 days)

```sql
select
  date_trunc('day', ingested_at) as day_utc,
  count(*) as intervals_written
from energy_intervals
where ingested_at >= now() - interval '14 days'
group by 1
order by 1 desc;
```

Pass target:
- counts should be present every day and generally stable.
- large drops may indicate sync gaps.

## 5. Days with near-zero production in last 30 days

```sql
select
  day,
  production_kwh,
  consumption_kwh,
  export_kwh,
  import_kwh
from energy_daily_agg
where day >= current_date - interval '30 days'
  and production_kwh < 0.2
order by day desc;
```

Pass target:
- verify rows match expected bad-weather or outage days.
- unexpected rows may indicate upstream ingestion issues.

## Optional monthly capacity check

```sql
select
  pg_size_pretty(pg_database_size(current_database())) as db_size,
  (select count(*) from energy_intervals) as intervals_rows,
  (select count(*) from energy_daily_agg) as daily_rows,
  (select count(*) from sync_runs) as sync_runs_rows;
```

Use this to watch storage growth on free tier.
