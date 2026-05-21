import assert from "node:assert/strict";

import {
  fetchEnergySummaryForDateRange,
  parseEnergyDateRange,
} from "../server/energyRequest.js";

const shouldPreferQuarterHourForSingleDay = async () => {
  const calls = [];

  const summary = await fetchEnergySummaryForDateRange({
    start: "2026-05-19",
    end: "2026-05-19",
    getCloudSummary: async () => null,
    getSummary: async ({ timeUnit }) => {
      calls.push(timeUnit);
      return {
        meta: { timeUnit },
        points: [],
        kpis: {},
      };
    },
  });

  assert.deepEqual(calls, ["QUARTER_OF_AN_HOUR"]);
  assert.equal(summary.meta.timeUnit, "QUARTER_OF_AN_HOUR");
};

const shouldFallbackToHourlyWhenQuarterHourFails = async () => {
  const calls = [];

  const summary = await fetchEnergySummaryForDateRange({
    start: "2026-05-19",
    end: "2026-05-19",
    getCloudSummary: async () => null,
    getSummary: async ({ timeUnit }) => {
      calls.push(timeUnit);

      if (timeUnit === "QUARTER_OF_AN_HOUR") {
        throw new Error("Requested time unit is not supported for this site");
      }

      return {
        meta: { timeUnit },
        points: [],
        kpis: {},
      };
    },
  });

  assert.deepEqual(calls, ["QUARTER_OF_AN_HOUR", "HOUR"]);
  assert.equal(summary.meta.timeUnit, "HOUR");
};

const shouldUseIntradayGranularityForThreeDayRanges = () => {
  const request = parseEnergyDateRange({
    start: "2026-05-18",
    end: "2026-05-20",
  });

  assert.deepEqual(request.preferredTimeUnits, ["QUARTER_OF_AN_HOUR", "HOUR"]);
};

const shouldUseDayGranularityForRangesLongerThanThreeDays = () => {
  const request = parseEnergyDateRange({
    start: "2026-05-18",
    end: "2026-05-22",
  });

  assert.deepEqual(request.preferredTimeUnits, ["DAY"]);
};

const shouldRejectInvalidDateRanges = () => {
  assert.throws(
    () => parseEnergyDateRange({ start: "2026-05-20", end: "2026-05-19" }),
    /Start date cannot be after end date/,
  );
};

const run = async () => {
  await shouldPreferQuarterHourForSingleDay();
  await shouldFallbackToHourlyWhenQuarterHourFails();
  shouldUseIntradayGranularityForThreeDayRanges();
  shouldUseDayGranularityForRangesLongerThanThreeDays();
  shouldRejectInvalidDateRanges();
  console.log("energyRequest tests passed");
};

run().catch((error) => {
  console.error("energyRequest tests failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});