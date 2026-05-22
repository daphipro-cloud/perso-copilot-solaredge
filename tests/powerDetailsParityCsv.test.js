import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizePowerDetails } from "../server/powerDetails.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_CSV_PATH = path.resolve(__dirname, "../samples/power-chart-data 05_22_2026 12_20 PM.csv");

const monthMap = {
  janvier: "01",
  fevrier: "02",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

const parseCsvLine = (line) => {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const toDateKey = (frenchDate) => {
  const match = frenchDate.match(/^(\d{1,2})\s+([\p{L}]+)\s+(\d{4})\s+(\d{2}):(\d{2})$/u);

  if (!match) {
    throw new Error(`Invalid French date in CSV: ${frenchDate}`);
  }

  const day = match[1].padStart(2, "0");
  const monthName = match[2]
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const month = monthMap[monthName];
  const year = match[3];
  const hour = match[4];
  const minute = match[5];

  if (!month) {
    throw new Error(`Unsupported month in CSV: ${match[2]}`);
  }

  return `${year}-${month}-${day} ${hour}:${minute}:00`;
};

const parseNumber = (value) => Number.parseFloat(String(value).replace(",", "."));

const sanitizeHeader = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim();

const readCsvRows = () => {
  const content = fs.readFileSync(SAMPLE_CSV_PATH, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const headers = parseCsvLine(lines[0]).map(sanitizeHeader);
  const rows = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cols[index] ?? ""]));

    rows.push({
      date: toDateKey(row["Heure de la mesure"]),
      productionKw: parseNumber(row["Production (kW)"]),
      toBuildingKw: parseNumber(row["Vers le bâtiment (kW)"]),
      toGridKw: parseNumber(row["Vers le réseau (kW)"]),
      consumptionKw: parseNumber(row["Consommation (kW)"]),
      fromPvKw: parseNumber(row["Depuis le PV (kW)"]),
      fromGridKw: parseNumber(row["Depuis le réseau (kW)"]),
    });
  }

  return rows;
};

const buildPowerDetailsPayload = (rows) => {
  const meters = [
    { type: "Production", values: [] },
    { type: "Consumption", values: [] },
    { type: "FeedIn", values: [] },
    { type: "Purchased", values: [] },
    { type: "SelfConsumption", values: [] },
  ];

  rows.forEach((row) => {
    meters[0].values.push({ date: row.date, value: row.productionKw });
    meters[1].values.push({ date: row.date, value: row.consumptionKw });
    meters[2].values.push({ date: row.date, value: row.toGridKw });
    meters[3].values.push({ date: row.date, value: row.fromGridKw });
    meters[4].values.push({ date: row.date, value: row.fromPvKw });
  });

  return { meters };
};

const approxEqual = (left, right, tolerance = 0.011) => Math.abs(left - right) <= tolerance;

const run = () => {
  const expectedRows = readCsvRows();
  const payload = buildPowerDetailsPayload(expectedRows);
  const normalizedRows = normalizePowerDetails(payload);

  assert.equal(normalizedRows.length, expectedRows.length, "Normalized rows length must match CSV rows length");

  const actualByDate = new Map(normalizedRows.map((row) => [row.date, row]));

  expectedRows.forEach((expected) => {
    const actual = actualByDate.get(expected.date);
    assert.ok(actual, `Missing normalized row for date ${expected.date}`);

    assert.ok(approxEqual(actual.productionKw, expected.productionKw), `Production mismatch at ${expected.date}`);
    assert.ok(approxEqual(actual.toBuildingKw, expected.toBuildingKw), `To building mismatch at ${expected.date}`);
    assert.ok(approxEqual(actual.toGridKw, expected.toGridKw), `To grid mismatch at ${expected.date}`);
    assert.ok(approxEqual(actual.consumptionKw, expected.consumptionKw), `Consumption mismatch at ${expected.date}`);
    assert.ok(approxEqual(actual.fromPvKw, expected.fromPvKw), `From PV mismatch at ${expected.date}`);
    assert.ok(approxEqual(actual.fromGridKw, expected.fromGridKw), `From grid mismatch at ${expected.date}`);
  });

  const sample0930 = actualByDate.get("2026-05-22 09:30:00");
  assert.ok(sample0930, "Expected to find 09:30 parity sample");
  assert.ok(approxEqual(sample0930.productionKw, 1.14), "09:30 production parity mismatch");
  assert.ok(approxEqual(sample0930.consumptionKw, 2.17), "09:30 consumption parity mismatch");
  assert.ok(approxEqual(sample0930.fromPvKw, 1.14), "09:30 from PV parity mismatch");
  assert.ok(approxEqual(sample0930.fromGridKw, 1.03), "09:30 from grid parity mismatch");

  console.log("powerDetails CSV parity test passed");
};

try {
  run();
} catch (error) {
  console.error("powerDetails CSV parity test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
