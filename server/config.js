import dotenv from "dotenv";

dotenv.config();

const getRequiredConfig = (name) => {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
};

const getOptionalConfig = (name) => {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

export const APP_CONFIG = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  solarEdgeApiKey: getRequiredConfig("SOLAREDGE_API_KEY"),
  solarEdgeSiteId: getRequiredConfig("SOLAREDGE_SITE_ID"),
  solarEdgeBaseUrl: "https://monitoringapi.solaredge.com",
  supabaseUrl: getOptionalConfig("SUPABASE_URL"),
  supabaseServiceRoleKey: getOptionalConfig("SUPABASE_SERVICE_ROLE_KEY"),
};
