import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_CONTRACTOR, DEMO_MANAGER, DEMO_OC_MANAGER, DEMO_OWNER, DEMO_PROPERTY_MANAGER } from "../src/demo-seed.js";
import { client, startApp } from "./helpers.js";

test("every demo account sees its own buildings and jobs on the map", async () => {
  const server = await startApp({ demoMode: true });
  const manager = client(server.base);
  const oc = client(server.base);
  const property = client(server.base);
  const contractor = client(server.base);
  const owner = client(server.base);
  try {
    assert.equal((await manager("POST", "/api/login", { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password })).status, 200);
    assert.equal((await oc("POST", "/api/login", { email: DEMO_OC_MANAGER.email, password: DEMO_OC_MANAGER.password })).status, 200);
    assert.equal((await property("POST", "/api/login", { email: DEMO_PROPERTY_MANAGER.email, password: DEMO_PROPERTY_MANAGER.password })).status, 200);
    assert.equal((await contractor("POST", "/api/login", { email: DEMO_CONTRACTOR.email, password: DEMO_CONTRACTOR.password })).status, 200);
    assert.equal((await owner("POST", "/api/login", { email: DEMO_OWNER.email, password: DEMO_OWNER.password })).status, 200);

    const mina = await manager("GET", "/api/map-pins");
    assert.ok(mina.json.points.some(point => point.kind === "building" && /Harbour View/.test(point.title)));
    assert.ok(mina.json.points.some(point => point.kind === "job" && /tap/i.test(point.title)));
    assert.ok(mina.json.points.every(point => point.lat != null && point.lng != null));
    assert.equal(mina.json.points.some(point => /Riverside/.test(point.title)), false);

    const helen = await oc("GET", "/api/map-pins");
    assert.ok(helen.json.points.some(point => point.kind === "building" && /Riverside/.test(point.title)));
    assert.equal(helen.json.points.some(point => /Harbour View/.test(point.title)), false);

    const leo = await property("GET", "/api/map-pins");
    assert.ok(leo.json.points.some(point => point.kind === "building" && /Clarendon|Southbank/.test(point.title + point.detail)));

    const sam = await contractor("GET", "/api/map-pins");
    assert.ok(sam.json.points.some(point => point.kind === "job"));
    assert.ok(sam.json.points.some(point => point.kind === "building"));
    assert.equal(sam.json.coverage.km, 12);
    const openText = sam.json.points.map(point => point.title + " " + point.detail).join(" ");
    assert.doesNotMatch(openText, /Collins|42 /);
    assert.ok(Array.isArray(sam.json.booked));

    const nick = await owner("GET", "/api/map-pins");
    const places = nick.json.points.filter(point => point.kind === "building");
    assert.ok(places.length >= 3);
    const spots = new Set(places.map(point => point.lat.toFixed(3) + "," + point.lng.toFixed(3)));
    assert.ok(spots.size >= 3);

    const buildings = await manager("GET", "/api/buildings");
    const building = buildings.json.buildings[0];
    await manager("POST", "/api/jobs", { buildingId: building.id, title: "Lift motor", area: "Plant room", tradeId: "lift" });
    const again = await contractor("GET", "/api/map-pins");
    assert.equal(again.json.points.some(point => /Lift motor/.test(point.title)), false);
  } finally {
    await server.close();
  }
});
