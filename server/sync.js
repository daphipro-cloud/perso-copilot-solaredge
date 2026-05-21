import { getRangeWindow } from "./dateRange.js";
import { buildEnergySummary } from "./aggregator.js";

const runSync = async () => {
  const ranges = ["day", "week", "month", "year"];

  for (const range of ranges) {
    const window = getRangeWindow(range);
    const summary = await buildEnergySummary({
      start: window.start,
      end: window.end,
      timeUnit: window.timeUnit,
      range,
    });

    console.log(`${range.toUpperCase()}:`, {
      points: summary.points.length,
      productionKwh: summary.kpis.productionKwh,
      consumptionKwh: summary.kpis.consumptionKwh,
      selfConsumptionKwh: summary.kpis.selfConsumptionKwh,
    });
  }
};

runSync().catch((error) => {
  console.error("Sync failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
