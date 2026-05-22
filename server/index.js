import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_CONFIG } from "./config.js";
import { getCloudEnergyDateBounds, getLastCloudSyncStatus, isCloudStoreConfigured } from "./cloudStore.js";
import { fetchEnergySummaryForDateRange } from "./energyRequest.js";
import { getCurrentPowerFlow } from "./solaredgeClient.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

app.use(express.json());
app.use(express.static(projectRoot));

app.get("/api/health", async (_request, response) => {
  const healthPayload = {
    status: "ok",
    generatedAt: new Date().toISOString(),
    cloudStoreConfigured: isCloudStoreConfigured(),
  };

  if (!healthPayload.cloudStoreConfigured) {
    response.json({
      ...healthPayload,
      lastSyncStatus: {
        configured: false,
        reachable: false,
        status: "not_configured",
      },
    });
    return;
  }

  try {
    const lastSyncStatus = await getLastCloudSyncStatus();

    response.json({
      ...healthPayload,
      lastSyncStatus,
    });
  } catch (error) {
    response.json({
      ...healthPayload,
      status: "degraded",
      lastSyncStatus: {
        configured: true,
        reachable: false,
        status: "query_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

app.get("/api/power/live", async (_request, response) => {
  try {
    const powerFlow = await getCurrentPowerFlow();
    response.json({ powerFlow });
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Failed to fetch current power flow",
    });
  }
});

app.get("/api/energy", async (request, response) => {
  const start = typeof request.query.start === "string" ? request.query.start : undefined;
  const end = typeof request.query.end === "string" ? request.query.end : undefined;

  try {
    const summary = await fetchEnergySummaryForDateRange({
      start,
      end,
    });

    response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch energy summary";
    response.status(400).json({ error: message });
  }
});

app.get("/api/energy/bounds", async (_request, response) => {
  try {
    const bounds = await getCloudEnergyDateBounds();
    response.json({
      ...bounds,
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load energy date bounds",
    });
  }
});

app.get("*", (_request, response) => {
  response.sendFile(path.join(projectRoot, "index.html"));
});

app.listen(APP_CONFIG.port, () => {
  console.log(`SolarEdge dashboard running on http://localhost:${APP_CONFIG.port}`);
});
