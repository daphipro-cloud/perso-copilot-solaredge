import { buildEnergySummary } from "./aggregator.js";
import { getEnergySummaryFromCloudStore } from "./cloudStore.js";

const SINGLE_DAY_TIME_UNITS = ["QUARTER_OF_AN_HOUR", "HOUR"];
const SHORT_RANGE_TIME_UNITS = ["QUARTER_OF_AN_HOUR", "HOUR"];
const DEFAULT_MULTI_DAY_TIME_UNIT = "DAY";
const MAX_INTRADAY_RANGE_DAYS = 3;

const withSource = (summary, source) => ({
  ...summary,
  source,
  meta: {
    ...(summary?.meta ?? {}),
    source,
  },
});

export const isSameDayRange = (start, end) => start === end;

export const isLineChartTimeUnit = (timeUnit) => ["HOUR", "QUARTER_OF_AN_HOUR"].includes(timeUnit);

const getRangeLengthInDays = (startDate, endDate) => {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay) + 1;
};

export const parseEnergyDateRange = ({ start, end }) => {
  if (!start || !end) {
    throw new Error("Both start and end dates are required (YYYY-MM-DD)");
  }

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }

  if (start > end) {
    throw new Error("Start date cannot be after end date.");
  }

  const rangeLengthInDays = getRangeLengthInDays(startDate, endDate);

  const preferredTimeUnits = isSameDayRange(start, end)
    ? SINGLE_DAY_TIME_UNITS
    : rangeLengthInDays <= MAX_INTRADAY_RANGE_DAYS
      ? SHORT_RANGE_TIME_UNITS
      : [DEFAULT_MULTI_DAY_TIME_UNIT];

  return {
    startDate,
    endDate,
    preferredTimeUnits,
  };
};

export const fetchEnergySummaryForDateRange = async ({
  start,
  end,
  getSummary = buildEnergySummary,
  getCloudSummary = getEnergySummaryFromCloudStore,
}) => {
  const { startDate, endDate, preferredTimeUnits } = parseEnergyDateRange({ start, end });

  let lastError;
  const startDateString = startDate.toISOString().slice(0, 10);
  const endDateString = endDate.toISOString().slice(0, 10);

  for (const timeUnit of preferredTimeUnits) {
    try {
      const cloudSummary = await getCloudSummary({
        start: startDateString,
        end: endDateString,
        timeUnit,
      }).catch(() => null);

      if (cloudSummary) {
        return withSource(cloudSummary, "supabase");
      }

      const summary = await getSummary({
        start: startDate,
        end: endDate,
        timeUnit,
      });

      return withSource(summary, "solaredge");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};