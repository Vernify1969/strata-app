import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createApp } from "../src/create-app.js";

export async function startApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-"));
  const config = {
    root: dir,
    port: 0,
    publicBaseUrl: "http://127.0.0.1:9",
    databasePath: path.join(dir, "strata.db"),
    outboxPath: path.join(dir, "outbox.jsonl"),
    devMailbox: true,
    cookieSecure: false,
    smtp: { host: "", port: 587, user: "", password: "", from: "Strata App <notices@example.com>" },
    owner: { email: "", password: "", name: "" },
    stripeSecretKey: "",
    stripePublishableKey: "",
    stripeWebhookSecret: ""
  };
  const app = await createApp(config);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  config.publicBaseUrl = `http://127.0.0.1:${port}`;
  return {
    base: config.publicBaseUrl,
    config,
    app,
    async close() {
      await new Promise(resolve => server.close(resolve));
    }
  };
}

export function client(base) {
  let cookie = "";
  return async function api(method, urlPath, body) {
    const headers = { "x-requested-with": "StrataApp" };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + urlPath, { method, headers, body: payload, redirect: "manual" });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const item of setCookies) {
      const pair = item.split(";")[0];
      if (pair.startsWith("strata_session=")) cookie = pair;
      if (pair === "strata_session=") cookie = "";
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
  };
}

export function lastLink(outboxPath) {
  const lines = fs.readFileSync(outboxPath, "utf8").trim().split("\n");
  const message = JSON.parse(lines[lines.length - 1]);
  const match = message.text.match(/https?:\/\/\S+/);
  return { message, link: match ? match[0] : "" };
}
