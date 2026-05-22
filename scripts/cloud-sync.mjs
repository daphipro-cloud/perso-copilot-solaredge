import dotenv from "dotenv";

import { APP_CONFIG } from "../server/config.js";
import { getEnergyDetailsData, getPowerDetailsData } from "../server/solaredgeClient.js";
import { normalizeEnergyDetails } from "../server/aggregator.js";
import { normalizePowerDetails } from "../server/powerDetails.js";

dotenv.config();

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (await import("node-fetch")).default;
}

const DEFAULT_BACKFILL_DAYS = 2;
const SYNC_STEP_MINUTES = 15;
const STREAM_NAME = "energyDetails:QOH";
const CHUNK_SIZE = 400;

const requireEnv = (name) => {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
};

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const addDays = (date, days) => new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
const addMinutes = (date, minutes) => new Date(date.getTime() + (minutes * 60 * 1000));

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDayStringUtc = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toKwh = (wh) => Number((Number(wh ?? 0) / 1000).toFixed(4));
const toKw = (value) => Number(Number(value ?? 0).toFixed(4));

const getSelfConsumptionKwh = (productionKwh, consumptionKwh, exportKwh) => {
  if (exportKwh > 0) {
    return Math.max(productionKwh - exportKwh, 0);
  }

  return Math.min(productionKwh, consumptionKwh);
};

const supabaseRequest = async ({ method, path, body, query, prefer }) => {
  const url = new URL(path, SUPABASE_URL);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const response = await fetchFn(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const getCheckpoint = async (siteId) => {
  const rows = await supabaseRequest({
    method: "GET",
    path: "/rest/v1/sync_checkpoints",
    query: {
      select: "last_success_end",
      site_id: `eq.${siteId}`,
      stream_name: `eq.${STREAM_NAME}`,
      limit: "1",
    },
  });

  const value = rows?.[0]?.last_success_end;
  return value ? new Date(value) : null;
};

const insertSyncRun = async (siteId, start, end) => {
  const rows = await supabaseRequest({
    method: "POST",
    path: "/rest/v1/sync_runs",
    body: [{
      site_id: siteId,
      status: "running",
      requested_start: start.toISOString(),
      requested_end: end.toISOString(),
      time_unit: "QUARTER_OF_AN_HOUR",
      metadata: { stream: STREAM_NAME },
    }],
  });

  return rows?.[0]?.id ?? null;
};

const updateSyncRun = async ({ runId, status, pointsRead, pointsWritten, errorMessage, metadata }) => {
  if (!runId) {
    return;
  }

  await supabaseRequest({
    method: "PATCH",
    path: "/rest/v1/sync_runs",
    query: {
      id: `eq.${runId}`,
    },
    body: {
      status,
      finished_at: new Date().toISOString(),
      points_read: pointsRead,
      points_written: pointsWritten,
      error_message: errorMessage ?? null,
      metadata: metadata ?? null,
    },
  });
};

const updateCheckpoint = async ({ siteId, lastSuccessEnd, lastError }) => {
  await supabaseRequest({
    method: "POST",
    path: "/rest/v1/sync_checkpoints",
    query: {
      on_conflict: "site_id,stream_name",
    },
    prefer: "resolution=merge-duplicates,return=representation",
    body: [{
      site_id: siteId,
      stream_name: STREAM_NAME,
      last_success_end: lastSuccessEnd ? lastSuccessEnd.toISOString() : null,
      last_attempt_at: new Date().toISOString(),
      last_error: lastError ?? null,
      updated_at: new Date().toISOString(),
    }],
  });
};

const chunk = (array, size) => {
  const result = [];

  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }

  return result;
};

const isMissingSchemaError = (message) => {
  const normalized = String(message ?? "");
  return normalized.includes("PGRST205") || normalized.includes("Could not find the table 'public.");
};

const getSetupHint = (error) => {
  const message = error instanceof Error ? error.message : String(error);

  if (isMissingSchemaError(message)) {
    return [
      "Supabase schema is not initialized.",
      "Apply db/schema.sql in Supabase SQL Editor, then run npm run sync:cloud again.",
      "Schema file: db/schema.sql",
    ].join(" ");
  }

  return null;
};

const upsertIntervals = async (siteId, rows) => {
  const mapped = [];
  const daySet = new Set();

  for (const row of rows) {
    const start = toDate(row.date);

    if (!start) {
      continue;
    }

    const end = addMinutes(start, SYNC_STEP_MINUTES);
    const productionKwh = toKwh(row.productionWh);
    const consumptionKwh = toKwh(row.consumptionWh);
    const exportKwh = toKwh(row.exportWh);
    const importKwh = toKwh(row.importWh);
    const selfConsumptionKwh = Number(
      getSelfConsumptionKwh(productionKwh, consumptionKwh, exportKwh).toFixed(4),
    );

    mapped.push({
      site_id: siteId,
      interval_start: start.toISOString(),
      interval_end: end.toISOString(),
      time_unit: "QUARTER_OF_AN_HOUR",
      production_kwh: productionKwh,
      consumption_kwh: consumptionKwh,
      import_kwh: importKwh,
      export_kwh: exportKwh,
      self_consumption_kwh: selfConsumptionKwh,
      raw_payload: row,
      ingested_at: new Date().toISOString(),
    });

    daySet.add(toDayStringUtc(start));
  }

  for (const batch of chunk(mapped, CHUNK_SIZE)) {
    await supabaseRequest({
      method: "POST",
      path: "/rest/v1/energy_intervals",
      query: {
        on_conflict: "site_id,interval_start,interval_end,time_unit",
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: batch,
    });
  }

  return {
    pointsWritten: mapped.length,
    days: [...daySet],
  };
};

const upsertPowerIntervals = async (siteId, rows) => {
  const mapped = [];

  for (const row of rows) {
    const start = toDate(row.date);

    if (!start) {
      continue;
    }

    const end = addMinutes(start, SYNC_STEP_MINUTES);

    mapped.push({
      site_id: siteId,
      interval_start: start.toISOString(),
      interval_end: end.toISOString(),
      time_unit: "QUARTER_OF_AN_HOUR",
      production_kw: toKw(row.productionKw),
      to_building_kw: toKw(row.toBuildingKw),
      to_grid_kw: toKw(row.toGridKw),
      consumption_kw: toKw(row.consumptionKw),
      from_pv_kw: toKw(row.fromPvKw),
      from_grid_kw: toKw(row.fromGridKw),
      raw_payload: row,
      ingested_at: new Date().toISOString(),
    });
  }

  for (const batch of chunk(mapped, CHUNK_SIZE)) {
    await supabaseRequest({
      method: "POST",
      path: "/rest/v1/power_intervals",
      query: {
        on_conflict: "site_id,interval_start,interval_end,time_unit",
      },
      prefer: "resolution=merge-duplicates,return=representation",
      body: batch,
    });
  }

  return mapped.length;
};

const upsertDailyAggregates = async (siteId, rows) => {
  const byDay = new Map();

  rows.forEach((row) => {
    const start = toDate(row.date);

    if (!start) {
      return;
    }

    const day = toDayStringUtc(start);
    const current = byDay.get(day) ?? {
      production_kwh: 0,
      consumption_kwh: 0,
      import_kwh: 0,
      export_kwh: 0,
      self_consumption_kwh: 0,
    };

    const productionKwh = toKwh(row.productionWh);
    const consumptionKwh = toKwh(row.consumptionWh);
    const exportKwh = toKwh(row.exportWh);
    const importKwh = toKwh(row.importWh);

    current.production_kwh += productionKwh;
    current.consumption_kwh += consumptionKwh;
    current.import_kwh += importKwh;
    current.export_kwh += exportKwh;
    current.self_consumption_kwh += getSelfConsumptionKwh(productionKwh, consumptionKwh, exportKwh);

    byDay.set(day, current);
  });

  const payload = [...byDay.entries()].map(([day, total]) => {
    const production = Number(total.production_kwh.toFixed(4));
    const selfConsumption = Number(total.self_consumption_kwh.toFixed(4));

    return {
      site_id: siteId,
      day,
      production_kwh: production,
      consumption_kwh: Number(total.consumption_kwh.toFixed(4)),
      import_kwh: Number(total.import_kwh.toFixed(4)),
      export_kwh: Number(total.export_kwh.toFixed(4)),
      self_consumption_kwh: selfConsumption,
      self_consumption_rate: production > 0
        ? Number(((selfConsumption / production) * 100).toFixed(3))
        : 0,
      refreshed_at: new Date().toISOString(),
    };
  });

  if (payload.length === 0) {
    return 0;
  }

  await supabaseRequest({
    method: "POST",
    path: "/rest/v1/energy_daily_agg",
    query: {
      on_conflict: "site_id,day",
    },
    prefer: "resolution=merge-duplicates,return=representation",
    body: payload,
  });

  return payload.length;
};

const main = async () => {
  const siteId = APP_CONFIG.solarEdgeSiteId;
  const end = new Date();
  const checkpoint = await getCheckpoint(siteId);
  const start = checkpoint ? addDays(checkpoint, -1) : addDays(end, -DEFAULT_BACKFILL_DAYS);
  const runId = await insertSyncRun(siteId, start, end);

  try {
    const [energyDetails, powerDetails] = await Promise.all([
      getEnergyDetailsData({
        start,
        end,
        timeUnit: "QUARTER_OF_AN_HOUR",
      }),
      getPowerDetailsData({
        start,
        end,
        timeUnit: "QUARTER_OF_AN_HOUR",
      }),
    ]);

    const rows = normalizeEnergyDetails(energyDetails);

