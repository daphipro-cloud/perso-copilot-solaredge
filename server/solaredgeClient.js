import { APP_CONFIG } from "./config.js";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { toDateTimeString } from "./dateRange.js";

// Polyfill fetch for Node <18
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (await import('node-fetch')).default;
}

const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const execFileAsync = promisify(execFile);
const HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  family: 4,
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error) => {
  const message = String(error?.message ?? "").toUpperCase();

  return (
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNREFUSED") ||
    message.includes("EAI_AGAIN") ||
    message.includes("ABORT") ||
    message.includes("FETCHERROR")
  );
};

const requestViaPowerShell = async (url) => {
  const psCommand = [
    "$ProgressPreference='SilentlyContinue'",
    `$u = '${String(url).replace(/'/g, "''")}'`,
    "Invoke-RestMethod -Method Get -Uri $u | ConvertTo-Json -Depth 50",
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", psCommand],
    { maxBuffer: 1024 * 1024 * 10 }
  );

  return JSON.parse(stdout);
};

const buildUrl = (path, params) => {
  const url = new URL(`${APP_CONFIG.solarEdgeBaseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
};

const requestSolarEdge = async (path, params) => {
  const url = buildUrl(path, {
    ...params,
    api_key: APP_CONFIG.solarEdgeApiKey,
  });

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchFn(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
        agent: HTTPS_AGENT,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`SolarEdge API failed (${response.status}): ${responseText}`);
      }

      const body = await response.json();

      if (body?.error) {
        throw new Error(`SolarEdge API error: ${body.error.message ?? "Unknown error"}`);
      }

      return body;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        break;
      }

      await delay(300 * attempt);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (process.platform === "win32" && isRetryableError(lastError)) {
    try {
      return await requestViaPowerShell(url);
    } catch {
      // keep original network error to preserve root cause
    }
  }

  throw lastError;
};

export const getCurrentPowerFlow = async () => {
  const path = `/site/${APP_CONFIG.solarEdgeSiteId}/currentPowerFlow`;
  const payload = await requestSolarEdge(path, {});
  return payload.siteCurrentPowerFlow ?? null;
};

// Use /energy.json for all energy queries
export const getEnergyData = async ({ startDate, endDate, timeUnit }) => {
  const path = `/site/${APP_CONFIG.solarEdgeSiteId}/energy.json`;
  const payload = await requestSolarEdge(path, {
    startDate,
    endDate,
    timeUnit,
  });
  return payload.energy ?? null;
};

export const getEnergyDetailsData = async ({ start, end, timeUnit }) => {
  const path = `/site/${APP_CONFIG.solarEdgeSiteId}/energyDetails`;
  const payload = await requestSolarEdge(path, {
    startTime: toDateTimeString(start),
    endTime: toDateTimeString(end),
    timeUnit,
    meters: "PRODUCTION,CONSUMPTION,FEEDIN,PURCHASED",
  });

  return payload.energyDetails ?? null;
};

export const getPowerDetailsData = async ({ start, end, timeUnit }) => {
  const path = `/site/${APP_CONFIG.solarEdgeSiteId}/powerDetails`;
  const payload = await requestSolarEdge(path, {
    startTime: toDateTimeString(start),
    endTime: toDateTimeString(end),
    timeUnit,
    meters: "PRODUCTION,CONSUMPTION,FEEDIN,PURCHASED,SELFCONSUMPTION",
  });

  return payload.powerDetails ?? null;
};
