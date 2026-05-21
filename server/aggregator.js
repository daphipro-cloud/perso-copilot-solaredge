import { getEnergyDetailsData } from "./solaredgeClient.js";
import { toDateString } from "./dateRange.js";

const toKWh = (wh) => Number((wh / 1000).toFixed(3));
const toNumber = (value) => Number(value ?? 0);

const meterTypeToField = {
  Production: "productionWh",
  Consumption: "consumptionWh",
  FeedIn: "exportWh",
  Purchased: "importWh",
};

const createEmptyPoint = (date) => ({
  date,
  productionWh: 0,
  consumptionWh: 0,
  exportWh: 0,
  importWh: 0,
});

export const normalizeEnergyDetails = (energyDetails) => {
  const pointsByDate = new Map();
  const meters = energyDetails?.meters ?? [];

  for (const meter of meters) {
    const field = meterTypeToField[meter?.type];

    if (!field) {
      continue;
    }

    for (const entry of meter.values ?? []) {
      const date = entry?.date;

      if (!date) {
        continue;
      }

      const point = pointsByDate.get(date) ?? createEmptyPoint(date);
      point[field] = toNumber(entry.value);
      pointsByDate.set(date, point);
    }
  }

  return [...pointsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
};

const getSelfConsumptionWh = (point) => {
  if (point.exportWh > 0) {
    return Math.max(point.productionWh - point.exportWh, 0);
  }

  return Math.min(point.productionWh, point.consumptionWh);
};

const buildKpis = (points) => {
  const totals = points.reduce((acc, point) => {
    acc.productionWh += point.productionWh;
    acc.consumptionWh += point.consumptionWh;
    acc.exportWh += point.exportWh;
    acc.importWh += point.importWh;
    acc.selfConsumptionWh += getSelfConsumptionWh(point);
    return acc;
  }, {
    productionWh: 0,
    consumptionWh: 0,
    exportWh: 0,
    importWh: 0,
    selfConsumptionWh: 0,
  });

  const selfConsumptionRate = totals.productionWh > 0
    ? (totals.selfConsumptionWh / totals.productionWh) * 100
    : 0;

  const selfSufficiencyRate = totals.consumptionWh > 0
    ? (totals.selfConsumptionWh / totals.consumptionWh) * 100
    : 0;

  return {
    productionKwh: toKWh(totals.productionWh),
    consumptionKwh: toKWh(totals.consumptionWh),
    exportedKwh: toKWh(totals.exportWh),
    importedKwh: toKWh(totals.importWh),
    selfConsumptionKwh: toKWh(totals.selfConsumptionWh),
    selfConsumptionRate: Number(selfConsumptionRate.toFixed(1)),
    selfSufficiencyRate: Number(selfSufficiencyRate.toFixed(1)),
  };
};

export const buildEnergySummary = async ({ start, end, timeUnit }) => {
  const startDate = toDateString(start);
  const endDate = toDateString(end);
  const energyDetails = await getEnergyDetailsData({ start, end, timeUnit });
  const rows = normalizeEnergyDetails(energyDetails);

  return {
    meta: {
      timeUnit,
      start: startDate,
      end: endDate,
      unit: energyDetails?.unit ?? "Wh",
      generatedAt: new Date().toISOString(),
    },
    points: rows.map((row) => ({
      label: row.date,
      productionKwh: toKWh(row.productionWh),
      consumptionKwh: toKWh(row.consumptionWh),
      exportKwh: toKWh(row.exportWh),
      importKwh: toKWh(row.importWh),
      selfConsumptionKwh: toKWh(getSelfConsumptionWh(row)),
    })),
    kpis: buildKpis(rows),
  };
};
