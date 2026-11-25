import fs from "node:fs";
import path from "node:path";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

export const DEFAULT_MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const DEFAULT_MAP_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function mapTiles(config = {}) {
  return {
    url: config.mapTileUrl || process.env.MAP_TILE_URL || DEFAULT_MAP_TILE_URL,
    attribution: config.mapTileAttribution || process.env.MAP_TILE_ATTRIBUTION || DEFAULT_MAP_TILE_ATTRIBUTION
  };
}

export function loadConfig(overrides = {}) {
  const root = overrides.root || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  if (!overrides.skipEnvFile) loadEnvFile(path.join(root, ".env"));
  const port = Number(overrides.port ?? process.env.PORT ?? 8787);
  const demoMode = overrides.demoMode ?? process.env.DEMO_MODE === "1";
  const publicBaseUrl = (overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
  const databasePath = overrides.databasePath || process.env.DATABASE_PATH || path.join(root, "var", "strata.db");
  const cookieSecure = overrides.cookieSecure ?? (process.env.COOKIE_SECURE === "1" || publicBaseUrl.startsWith("https://"));
  return {
    root,
    port,
    demoMode,
    publicBaseUrl,
    databasePath: path.isAbsolute(databasePath) ? databasePath : path.resolve(root, databasePath),
    outboxPath: overrides.outboxPath || path.join(root, "var", "outbox.jsonl"),
    devMailbox: demoMode || (overrides.devMailbox ?? process.env.DEV_MAILBOX === "1"),
    cookieSecure,
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || "",
      password: process.env.SMTP_PASSWORD || "",
      from: process.env.SMTP_FROM || "TaskSpeck Strata <notices@example.com>"
    },
    owner: {
      email: (process.env.OWNER_EMAIL || "").trim().toLowerCase(),
      password: process.env.OWNER_PASSWORD || "",
      name: process.env.OWNER_NAME || "Platform owner"
    },
    stripeSecretKey: demoMode ? "" : (process.env.STRIPE_SECRET_KEY || ""),
    stripePublishableKey: demoMode ? "" : (process.env.STRIPE_PUBLISHABLE_KEY || ""),
    stripeWebhookSecret: demoMode ? "" : (process.env.STRIPE_WEBHOOK_SECRET || ""),
    commissionPercent: Number(process.env.COMMISSION_PERCENT || 15),
    urgentFeeCents: Number(process.env.URGENT_FEE_CENTS || 2500),
    apartmentFeeCents: Number(process.env.APARTMENT_FEE_CENTS || 0),
    apartmentFeeEnabled: process.env.APARTMENT_FEE_ENABLED === "1",
    documentsPath: overrides.documentsPath || process.env.DOCUMENTS_PATH || path.join(root, "var", "documents"),
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? "",
    s3: {
      bucket: process.env.S3_BUCKET || "",
      endpoint: process.env.S3_ENDPOINT || "",
      region: process.env.S3_REGION || "auto",
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ""
    },
    anthropicApiKey: overrides.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
    mapTileUrl: overrides.mapTileUrl || process.env.MAP_TILE_URL || DEFAULT_MAP_TILE_URL,
    mapTileAttribution: overrides.mapTileAttribution || process.env.MAP_TILE_ATTRIBUTION || DEFAULT_MAP_TILE_ATTRIBUTION,
    supportEmail: overrides.supportEmail || process.env.SUPPORT_EMAIL || "support@your-domain.example",
    vapidPublicKey: overrides.vapidPublicKey || process.env.VAPID_PUBLIC_KEY || "",
    vapidPrivateKey: overrides.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY || "",
    vapidSubject: overrides.vapidSubject || process.env.VAPID_SUBJECT || ""
  };
}
