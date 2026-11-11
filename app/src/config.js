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

export function loadConfig(overrides = {}) {
  const root = overrides.root || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  if (!overrides.skipEnvFile) loadEnvFile(path.join(root, ".env"));
  const port = Number(overrides.port ?? process.env.PORT ?? 8787);
  const publicBaseUrl = (overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
  const databasePath = overrides.databasePath || process.env.DATABASE_PATH || path.join(root, "var", "strata.db");
  return {
    root,
    port,
    publicBaseUrl,
    databasePath: path.isAbsolute(databasePath) ? databasePath : path.resolve(root, databasePath),
    outboxPath: overrides.outboxPath || path.join(root, "var", "outbox.jsonl"),
    devMailbox: overrides.devMailbox ?? process.env.DEV_MAILBOX === "1",
    cookieSecure: overrides.cookieSecure ?? process.env.COOKIE_SECURE === "1",
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || "",
      password: process.env.SMTP_PASSWORD || "",
      from: process.env.SMTP_FROM || "Strata App <notices@example.com>"
    },
    owner: {
      email: (process.env.OWNER_EMAIL || "").trim().toLowerCase(),
      password: process.env.OWNER_PASSWORD || "",
      name: process.env.OWNER_NAME || "Platform owner"
    },
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ""
  };
}
