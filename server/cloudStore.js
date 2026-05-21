import { APP_CONFIG } from "./config.js";

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (await import("node-fetch")).default;
}

const INTERVAL_TIME_UNITS = new Set(["QUARTER_OF_AN_HOUR", "HOUR"]);

const isConfigured = () => Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseServiceRoleKey);

export const isCloudStoreConfigured = () => isConfigured();

const supabaseRequest = async ({ path, queryEntries }) => {
  const url = new URL(path, APP_CONFIG.supabaseUrl);

  queryEntries.forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      apikey: APP_CONFIG.supabaseServiceRoleKey,
      Authorization: `Bearer ${APP_CONFIG.supabaseServiceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase query failed (${response.status}): ${text}`);
  }

  return response.json();
};

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDayIso = (dayString) => `${dayString}T00:00:00.000Z`;
const nextDayIso = (dayString) => {
  const day = new Date(`${dayString}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString();
};

const buildKpis = (points) => {
  const totals = points.reduce((acc, point) => {
    acc.productionKwh += Number(point.productionKwh ?? 0);
    acc.consumptionKwh += Number(point.consumptionKwh ?? 0);
    acc.exportKwh += Number(point.exportKwh ?? 0);
    acc.importKwh += Number(point.importKwh ?? 0);
    acc.selfConsumptionKwh += Number(point.selfConsumptionKwh ?? 0);
    return acc;
  }, {
    productionKwh: 0,
    consumptionKwh: 0,
    exportKwh: 0,
    importKwh: 0,
    selfConsumptionKwh: 0,
  });

  const selfConsumptionRate = totals.productionKwh > 0
    ? (totals.selfConsumptionKwh / totals.productionKwh) * 100
    : 0;

  const selfSufficiencyRate = totals.consumptionKwh > 0
    ? (totals.selfConsumptionKwh / totals.consumptionKwh) * 100
    : 0;

  const round = (value) => Number(value.toFixed(3));

  return {
    productionKwh: round(totals.productionKwh),
    consumptionKwh: round(totals.consumptionKwh),
    exportedKwh: round(totals.exportKwh),
    importedKwh: round(totals.importKwh),
    selfConsumptionKwh: round(totals.selfConsumptionKwh),
    selfConsumptionRate: Number(selfConsumptionRate.toFixed(1)),
    selfSufficiencyRate: Number(selfSufficiencyRate.toFixed(1)),
  };
};

const toIntervalPoint = (row) => ({
  label: row.interval_start,
  productionKwh: Number(row.production_kwh ?? 0),
  consumptionKwh: Number(row.consumption_kwh ?? 0),
  exportKwh: Number(row.export_kwh ?? 0),
  importKwh: Number(row.import_kwh ?? 0),
  selfConsumptionKwh: Number(row.self_consumption_kwh ?? 0),
});

const aggregateIntervalsByHour = (rows) => {
  const buckets = new Map();

  rows.forEach((row) => {
    const startDate = parseDate(row.interval_start);

    if (!startDate) {
      return;
    }

    startDate.setUTCMinutes(0, 0, 0);
    const key = startDate.toISOString();
    const current = buckets.get(key) ?? {
      label: key,
      productionKwh: 0,
      consumptionKwh: 0,
      exportKwh: 0,
      importKwh: 0,
      selfConsumptionKwh: 0,
    };

    current.productionKwh += Number(row.production_kwh ?? 0);
    current.consumptionKwh += Number(row.consumption_kwh ?? 0);
    current.exportKwh += Number(row.export_kwh ?? 0);
    current.importKwh += Number(row.import_kwh ?? 0);
    current.selfConsumptionKwh += Number(row.self_consumption_kwh ?? 0);

    buckets.set(key, current);
  });

  return [...buckets.values()].sort((left, right) => left.label.localeCompare(right.label));
};

const loadIntervalRows = async ({ start, end }) => {
  const rows = await supabaseRequest({
    path: "/rest/v1/energy_intervals",
    queryEntries: [
      ["select", "interval_start,production_kwh,consumption_kwh,import_kwh,export_kwh,self_consumption_kwh"],
      ["site_id", `eq.${APP_CONFIG.solarEdgeSiteId}`],
      ["interval_start", `gte.${startOfDayIso(start)}`],
      ["interval_start", `lt.${nextDayIso(end)}`],
      ["time_unit", "eq.QUARTER_OF_AN_HOUR"],
      ["order", "interval_start.asc"],
      ["limit", "10000"],
    ],
  });

  return rows;
};

const loadDailyRows = async ({ start, end }) => {
  const rows = await supabaseRequest({
    path: "/rest/v1/energy_daily_agg",
    queryEntries: [
      ["select", "day,production_kwh,consumption_kwh,import_kwh,export_kwh,self_consumption_kwh"],
      ["site_id", `eq.${APP_CONFIG.solarEdgeSiteId}`],
      ["day", `gte.${start}`],
      ["day", `lte.${end}`],
      ["order", "day.asc"],
      ["limit", "1000"],
    ],
  });

  return rows;
};

export const getLastCloudSyncStatus = async () => {
  if (!isConfigured()) {
    return {
      configured: false,
      reachable: false,
      status: "not_configured",
    };
  }

  const rows = await supabaseRequest({
    path: "/rest/v1/sync_runs",
    queryEntries: [
      ["select", "status,started_at,finished_at,error_message,time_unit,points_read,points_written"],
      ["site_id", `eq.${APP_CONFIG.solarEdgeSiteId}`],
      ["order", "started_at.desc"],
      ["limit", "1"],
    ],
  });

  const latest = rows?.[0] ?? null;

  return {
    configured: true,
    reachable: true,
    status: latest?.status ?? "never_run",
    startedAt: latest?.started_at ?? null,
    finishedAt: latest?.finished_at ?? null,
    timeUnit: latest?.time_unit ?? null,
    pointsRead: Number(latest?.points_read ?? 0),
    pointsWritten: Number(latest?.points_written ?? 0),
    errorMessage: latest?.error_message ?? null,
  };
};

const buildSummary = ({ points, start, end, timeUnit }) => ({
  meta: {
    timeUnit,
    start,
    end,
    unit: "kWh",
    source: "supabase",
    generatedAt: new Date().toISOString(),
  },
  points,
  kpis: buildKpis(points),
});

const toDailyPoint = (row) => ({
  label: row.day,
  productionKwh: Number(row.production_kwh ?? 0),
  consumptionKwh: Number(row.consumption_kwh ?? 0),
  exportKwh: Number(row.export_kwh ?? 0),
  importKwh: Number(row.import_kwh ?? 0),
  selfConsumptionKwh: Number(row.self_consumption_kwh ?? 0),
});

export const getEnergySummaryFromCloudStore = async ({ start, end, timeUnit }) => {
  if (!isConfigured()) {
    return null;
  }

  if (INTERVAL_TIME_UNITS.has(timeUnit)) {
    const intervalRows = await loadIntervalRows({ start, end });

    if (!Array.isArray(intervalRows) || intervalRows.length === 0) {
      return null;
    }

    const points = timeUnit === "HOUR"
      ? aggregateIntervalsByHour(intervalRows)
      : intervalRows.map(toIntervalPoint);

    return buildSummary({ points, start, end, timeUnit });
  }

  const dailyRows = await loadDailyRows({ start, end });

  if (!Array.isArray(dailyRows) || dailyRows.length === 0) {
    return null;
  }

  return buildSummary({
    points: dailyRows.map(toDailyPoint),
    start,
    end,
    timeUnit,
  });
};
