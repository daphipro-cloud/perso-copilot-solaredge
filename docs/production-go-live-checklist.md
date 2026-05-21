# Production Go-Live Checklist (Render + Netlify)

This is a strict single-path runbook for always-on production:
1. Supabase for data storage.
2. GitHub Actions for scheduled sync.
3. Render for API hosting.
4. Netlify for frontend hosting.

## 1. Prerequisites

1. Repository is pushed to GitHub.
2. Supabase project is created.
3. Local checks are green:
1. npm run test:unit
2. npm run sync:cloud

## 2. Secrets Hygiene (Mandatory)

1. Rotate keys if ever exposed:
1. SolarEdge API key
2. Supabase service role key
2. Store real keys only in local .env and GitHub Actions secrets.
3. Keep [../.env.example](../.env.example) as placeholders only.

## 3. Initialize Supabase Schema

1. Open Supabase SQL Editor.
2. Run all SQL from [../db/schema.sql](../db/schema.sql).
3. Verify tables exist:
1. energy_intervals
2. energy_daily_agg
3. sync_checkpoints
4. sync_runs

## 4. Configure GitHub Actions Secrets

In GitHub repository Settings > Secrets and variables > Actions, create:
1. SOLAREDGE_API_KEY
2. SOLAREDGE_SITE_ID
3. SUPABASE_URL
4. SUPABASE_SERVICE_ROLE_KEY

## 5. Enable Scheduled Sync (GitHub Actions)

1. Verify workflow file: [../.github/workflows/solaredge-sync.yml](../.github/workflows/solaredge-sync.yml).
2. Trigger one manual workflow run (`workflow_dispatch`).
3. Confirm workflow succeeds.
4. Keep cron schedule enabled.

## 6. Deploy API on Render

1. Create a new Render Web Service from this GitHub repo.
2. Runtime: Node.
3. Build command: npm install
4. Start command: npm start
5. Set environment variables in Render:
1. SOLAREDGE_API_KEY
2. SOLAREDGE_SITE_ID
3. SUPABASE_URL
4. SUPABASE_SERVICE_ROLE_KEY
6. Deploy and copy the Render service URL (example: https://your-api.onrender.com).

## 7. Deploy Frontend on Netlify

1. Create a new Netlify site from this GitHub repo.
2. Build command: leave empty (static app).
3. Publish directory: .
4. Add Netlify redirect file [../_redirects](../_redirects) if you want same-domain API proxy:
1. /api/*  https://your-api.onrender.com/api/:splat  200
5. Deploy site.

## 8. Production Validation

Run these checks against your production domain:
1. GET /api/health
Expected:
1. status is ok or degraded
2. cloudStoreConfigured is true
3. lastSyncStatus.status is success after first sync

2. GET /api/energy?start=YYYY-MM-DD&end=YYYY-MM-DD
Expected:
1. source is supabase
2. meta.source is supabase
3. points has data

3. GET /api/power/live
Expected:
1. returns powerFlow object

## 9. Operations

1. Add GitHub Actions failure notifications.
2. Check sync_runs in Supabase weekly.
3. Keep manual workflow_dispatch available for recovery.

## 10. Rollback

1. If API deploy fails, redeploy previous successful Render deployment.
2. If scheduler fails, run workflow manually and inspect sync_runs/error_message.
3. If Supabase is unavailable, /api/energy fallback path should still use SolarEdge.

## 11. Done Criteria

1. Dashboard is reachable from phone/browser without local machine running.
2. Scheduled sync runs without manual intervention.
3. /api/health shows cloud configured and recent sync success.
4. /api/energy shows source as supabase in normal operation.
