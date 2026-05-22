# SolarEdge Dashboard Starter

Starter web application that fetches data from SolarEdge and displays:
- Power consumption
- Production
- Grid import/export
- Self-consumption (day/week/month/year)

## 1. Configure

1. Open `.env` and set your SolarEdge site id:
   - `SOLAREDGE_SITE_ID=<your-site-id>`
2. Your API key is already configured in `.env`.

## 2. Install and Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 3. Available API endpoints

- `GET /api/health`
- `GET /api/power/live`
- `GET /api/energy?range=day|week|month|year&date=YYYY-MM-DD`

## 4. Project structure

- `server/index.js`: Express server and API routes
- `server/solaredgeClient.js`: SolarEdge API client
- `server/aggregator.js`: Aggregates values and KPI calculations
- `server/dateRange.js`: Day/week/month/year range helpers
- `index.html`, `styles.css`, `script.js`: Dashboard frontend

## 5. Notes

- The API key is loaded on the server side only.
- `.env` is ignored by Git via `.gitignore`.
- Self-consumption is computed as `production - feedIn`, with `min(production, consumption)` fallback.
- `/api/energy` now reads cloud-stored history first when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, then falls back to direct SolarEdge API aggregation.
- `/api/energy` responses include `source` (`supabase` or `solaredge`) and mirror this in `meta.source` for debugging which backend path served the data.
- `power_intervals` stores kW interval parity data from SolarEdge `powerDetails` for like-for-like comparison with SolarEdge monitoring CSV exports.
- Never commit real keys in `.env.example` or any tracked file. Keep real values only in local `.env` and CI/CD secrets.

## 6. Cloud Deployment Blueprint

- Architecture and step-by-step rollout: [docs/cloud-deployment-blueprint.md](docs/cloud-deployment-blueprint.md)
- PostgreSQL schema for Supabase/Neon: [db/schema.sql](db/schema.sql)
- Scheduled ingestion workflow template: [.github/workflows/solaredge-sync.yml](.github/workflows/solaredge-sync.yml)
ls- Final production runbook: [docs/production-go-live-checklist.md](docs/production-go-live-checklist.md)
