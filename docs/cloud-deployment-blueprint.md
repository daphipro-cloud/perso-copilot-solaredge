# SolarEdge Cloud Data Architecture Blueprint

## 1. Target Architecture

1. SolarEdge API remains the source of truth.
2. A scheduled cloud job ingests interval data every 30 minutes.
3. Data is persisted in managed Postgres (Supabase or Neon free tier).
4. Dashboard APIs read from Postgres for fast historical queries.
5. Live power endpoint can optionally still call SolarEdge directly.

## 2. Managed Services

1. Database: Supabase Postgres free tier (or Neon Postgres).
2. Scheduler: GitHub Actions cron using .github/workflows/solaredge-sync.yml.
3. API Hosting: Render web service or Vercel serverless functions.
4. Frontend Hosting: Vercel or Netlify static deployment.

## 3. Data Model

Apply [db/schema.sql](../db/schema.sql) to your Postgres instance.

Tables:
1. energy_intervals: interval-level production/consumption/import/export/self-consumption.
2. energy_daily_agg: precomputed daily totals and rate.
3. sync_checkpoints: high-water mark and recovery context.
4. sync_runs: operational logging for observability.

## 4. Sync Strategy

1. Incremental window
1. Read sync_checkpoints.last_success_end.
2. Fetch from last_success_end minus 1 day (safe overlap) to now.
3. Upsert rows by unique key site_id + interval_start + interval_end + time_unit.

2. Backfill guard
1. Every run, also include previous 2 full days to absorb SolarEdge delayed corrections.

3. Failure handling
1. Retry SolarEdge calls with exponential backoff.
2. Persist run status and last_error in sync_runs and sync_checkpoints.
3. Never delete records during sync.

## 5. API Query Pattern

1. Dashboard historical endpoints read from energy_intervals or energy_daily_agg.
2. Time-unit mapping:
1. QUARTER_OF_AN_HOUR and HOUR from energy_intervals.
2. DAY and above from energy_daily_agg.
3. For partial current day, combine persisted data plus optional live call.

## 6. Deployment Steps

1. Create Supabase project.
2. Run SQL from [db/schema.sql](../db/schema.sql).
3. Add GitHub repository secrets:
1. SOLAREDGE_API_KEY
2. SOLAREDGE_SITE_ID
3. SUPABASE_URL
4. SUPABASE_SERVICE_ROLE_KEY
4. Commit and enable [/.github/workflows/solaredge-sync.yml](../.github/workflows/solaredge-sync.yml).
5. Deploy API service and set the same environment variables.
6. Point frontend to deployed API base URL.

## 7. Security

1. Keep SolarEdge API key server-side only.
2. Restrict DB credentials to backend and GitHub Actions secrets.
3. If dashboard is private, add auth in API before public deployment.

## 8. Cost and Limits Notes

1. Free tiers may pause instances when idle.
2. Free DB storage is limited; keep raw intervals and derive aggregates.
3. Add retention policy later only if needed, but keep daily aggregates indefinitely.

## 9. Next Implementation Slice

1. Add Postgres client module in server.
2. Implement npm run sync:cloud script that:
1. Fetches SolarEdge energyDetails.
2. Normalizes to interval rows.
3. Upserts to Postgres.
4. Updates checkpoint and run logs.
3. Switch /api/energy to DB-first with fallback to live SolarEdge.
