import { buildEnergySummary } from "../server/aggregator.js";
import { getRangeWindow } from "../server/dateRange.js";
import { getCurrentPowerFlow } from "../server/solaredgeClient.js";

const ranges = ["day", "week", "month", "year"];

const formatResult = (range, summary) => {
  return {
    range,
    points: summary.points.length,
    start: summary.meta.start,
    end: summary.meta.end,
    productionKwh: summary.kpis.productionKwh,
  };
};

const verifyRange = async (range) => {
  const window = getRangeWindow(range);
  const summary = await buildEnergySummary({
    start: window.start,
    end: window.end,
    timeUnit: window.timeUnit,
    range,
  });

  if (!Array.isArray(summary.points) || summary.points.length === 0) {
    throw new Error(`No data points returned for range: ${range}`);
  }

  if (!Number.isFinite(summary.kpis.productionKwh)) {
    throw new Error(`Invalid KPI values returned for range: ${range}`);
  }

  return formatResult(range, summary);
};

const run = async () => {
  console.log("SolarEdge integration verification starting...");

  const rangeResults = [];

  for (const range of ranges) {
    const result = await verifyRange(range);
    rangeResults.push(result);
  }

  console.log("Energy endpoint verification succeeded:");
  console.table(rangeResults);

  try {
    const powerFlow = await getCurrentPowerFlow();

    console.log("Live currentPowerFlow verification succeeded:");
    console.log({
      pvCurrentPower: powerFlow?.pv?.currentPower ?? null,
      loadCurrentPower: powerFlow?.load?.currentPower ?? null,
      gridCurrentPower: powerFlow?.grid?.currentPower ?? null,
      unit: "kW",
    });
  } catch (error) {
    console.warn("Live currentPowerFlow check failed (non-blocking):", error instanceof Error ? error.message : error);
  }

  console.log("SolarEdge integration verification finished.");
};

run().catch((error) => {
  console.error("SolarEdge integration verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
