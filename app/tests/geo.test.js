import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { locateAddress, locatePostcode } from "../src/geo.js";
import { client, lastLink, startApp } from "./helpers.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a postcode is looked up once and then read from the cache", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-"));
  const db = openDatabase(path.join(dir, "geo.db"));
  const first = locatePostcode(db, "3000");
  assert.equal(first.cached, false);
  assert.ok(Math.abs(first.lat + 37.8136) < 0.02);
  const second = locatePostcode(db, "3000");
  assert.equal(second.cached, true);
  assert.equal(second.lat, first.lat);
  const address = await locateAddress(db, {
    geocode: async () => ({ lat: -37.82, lng: 144.96 })
  }, "42 Collins Street, Melbourne");
  assert.equal(address.cached, false);
  const again = await locateAddress(db, { geocode: async () => { throw new Error("should use the cache"); } }, "42 Collins Street, Melbourne");
  assert.equal(again.cached, true);
  assert.equal(again.lng, 144.96);
  db.close();
});

test("the map page uses OpenStreetMap and a short map card", async () => {
  const server = await startApp();
  const manager = client(server.base);
  try {
    assert.equal((await manager("POST", "/api/register", {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    })).status, 201);
    const { link } = lastLink(server.config.outboxPath);
    await manager("GET", link.slice(link.indexOf("/api/")));
    assert.equal((await manager("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" })).status, 200);
    const place = await manager("GET", "/api/geo?postcode=3000");
    assert.equal(place.status, 200);
    assert.equal(place.json.cached, false);
    assert.equal((await manager("GET", "/api/geo?postcode=3000")).json.cached, true);
    const page = await fetch(server.base + "/");
    const html = await page.text();
    assert.match(html, /leaflet@1\.9\.4/);
    assert.match(html, /live-map/);
    assert.match(html, /OpenStreetMap/);
    assert.match(html, /height: 360px/);
    assert.match(html, /height: 220px/);
    assert.match(html, /Full screen/);
  } finally {
    await server.close();
  }
});
