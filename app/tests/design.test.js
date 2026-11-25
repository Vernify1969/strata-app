import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DEMO_OWNER, DEMO_MANAGER } from "../src/demo-seed.js";
import { client, startApp } from "./helpers.js";

test("the owner can save one of three looks and everyone else sees it", async () => {
  const server = await startApp({ demoMode: true });
  const owner = client(server.base);
  const manager = client(server.base);
  try {
    const health = await fetch(server.base + "/api/health");
    assert.equal((await health.json()).designTheme, "clear");
    assert.equal((await owner("POST", "/api/login", { email: DEMO_OWNER.email, password: DEMO_OWNER.password })).status, 200);
    assert.equal((await manager("POST", "/api/login", { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password })).status, 200);
    assert.equal((await manager("PATCH", "/api/owner/settings", { designTheme: "warm" })).status, 403);
    const saved = await owner("PATCH", "/api/owner/settings", { designTheme: "warm" });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.designTheme, "warm");
    const again = await fetch(server.base + "/api/health");
    assert.equal((await again.json()).designTheme, "warm");
    const admin = await owner("PATCH", "/api/admin/settings", { designTheme: "modern", confirm: true, reason: "Preview the dark header" });
    assert.equal(admin.status, 200);
    assert.equal(admin.json.designTheme, "modern");
    const db = new DatabaseSync(server.config.databasePath, { readOnly: true });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 20);
    db.close();
  } finally {
    await server.close();
  }
});

test("the app serves the council map, self-hosted fonts, and the new layout", async () => {
  const server = await startApp({ demoMode: true });
  try {
    const map = await fetch(server.base + "/maps/melbourne-lgas.geojson");
    assert.equal(map.status, 200);
    const geo = await map.json();
    assert.equal(geo.type, "FeatureCollection");
    assert.ok(geo.features.some(feature => feature.properties.name === "Melbourne"));
    assert.match(geo.attribution, /CC BY 4.0/);
    const font = await fetch(server.base + "/fonts/plus-jakarta-sans-400.woff2");
    assert.equal(font.status, 200);
    const page = await (await fetch(server.base + "/")).text();
    assert.doesNotMatch(page, /fonts\.googleapis\.com/);
    assert.match(page, /Plus Jakarta Sans/);
    assert.match(page, /Try a look/);
    assert.match(page, /Clear &amp; Calm/);
    assert.match(page, /Warm Professional/);
    assert.match(page, /Modern Dark-Accent/);
    assert.match(page, /Ask /);
    assert.match(page, /chloe-drawer/);
    assert.doesNotMatch(page, /chloe-fab/);
    assert.match(page, /melbourne-lgas\.geojson/);
    const root = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    assert.doesNotMatch(root, /fonts\.googleapis\.com/);
  } finally {
    await server.close();
  }
});
