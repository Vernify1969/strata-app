import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { DEMO_CONTRACTOR, DEMO_MANAGER, DEMO_OC_MANAGER, DEMO_PROPERTY_MANAGER, DEMO_QR_TOKEN } from "../src/demo-seed.js";
import { client, startApp } from "./helpers.js";

test("demo mode ignores Stripe keys and says it is a demo", () => {
  const previous = {
    DEMO_MODE: process.env.DEMO_MODE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY
  };
  process.env.DEMO_MODE = "1";
  process.env.STRIPE_SECRET_KEY = "sk_live_should_not_be_used";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_live_should_not_be_used";
  try {
    const config = loadConfig({ skipEnvFile: true, root: "/tmp" });
    assert.equal(config.demoMode, true);
    assert.equal(config.stripeSecretKey, "");
    assert.equal(config.stripePublishableKey, "");
    assert.equal(config.devMailbox, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the demo seeds sample people, simulates a payment, and keeps QR printing locked", async () => {
  const server = await startApp({ demoMode: true, securityGate: true, publicBaseUrl: "https://qr.taskspeck.com.au" });
  const manager = client(server.base);
  const guest = client(server.base);
  try {
    const health = await fetch(server.base + "/api/health");
    assert.equal((await health.json()).demo, true);
    const page = await fetch(server.base + "/r/" + DEMO_QR_TOKEN);
    assert.match(await page.text(), /Demo, test data only/);
    const signed = await manager("POST", "/api/login", { email: DEMO_MANAGER.email, password: DEMO_MANAGER.password });
    assert.equal(signed.status, 200);
    const me = await manager("GET", "/api/me");
    assert.match(me.json.banner, /Demo, test data only/);
    const buildings = await manager("GET", "/api/buildings");
    assert.equal(buildings.json.buildings.length, 1);
    assert.equal(buildings.json.buildings[0].name, "Harbour View Apartments");
    const jobs = await manager("GET", "/api/jobs");
    const quoted = jobs.json.jobs.find(job => job.title === "Garden tap will not turn off");
    const quote = jobs.json.quotes.find(item => item.jobId === quoted.id);
    const approved = await manager("POST", "/api/jobs/" + quoted.id + "/approve", { quoteId: quote.id });
    assert.equal(approved.json.paid, false);
    const paid = await manager("POST", "/api/jobs/" + quoted.id + "/payments", { idempotencyKey: "demo-pay-1" });
    assert.equal(paid.status, 201);
    assert.equal(paid.json.simulated, true);
    assert.equal(paid.json.paid, true);
    assert.equal(paid.json.holder, "stripe");
    const stage = server.app.locals.db.prepare("SELECT stage FROM jobs WHERE id = ?").get(quoted.id);
    assert.equal(stage.stage, "paid");
    const places = server.app.locals.db.prepare("SELECT id FROM places WHERE token = ?").get(DEMO_QR_TOKEN);
    const sheet = await manager("GET", "/api/places/" + places.id + "/sheet");
    assert.equal(sheet.status, 403);
    assert.match(sheet.json.error, /stay off in this demo/);
    const created = await guest("POST", "/api/register", {
      kind: "manager",
      role: "oc_manager",
      name: "Olivia Chen",
      email: "olivia@harbour.example",
      mobile: "0418111222",
      password: "Harbour1",
      confirm: "Harbour1",
      agree: true
    });
    assert.equal(created.status, 201);
    assert.match(created.json.devLink, /verify-email/);
    const contractor = await client(server.base)("POST", "/api/login", { email: DEMO_CONTRACTOR.email, password: DEMO_CONTRACTOR.password });
    assert.equal(contractor.status, 200);
    assert.equal(contractor.json.user.roleLabel, "Contractor");
    const oc = client(server.base);
    const ocIn = await oc("POST", "/api/login", { email: DEMO_OC_MANAGER.email, password: DEMO_OC_MANAGER.password });
    assert.equal(ocIn.json.user.roleLabel, "Owners Corporation manager");
    const ocPlaces = await oc("GET", "/api/buildings");
    assert.deepEqual(ocPlaces.json.buildings.map(item => item.name), ["Riverside Court"]);
    const property = client(server.base);
    const propertyIn = await property("POST", "/api/login", { email: DEMO_PROPERTY_MANAGER.email, password: DEMO_PROPERTY_MANAGER.password });
    assert.equal(propertyIn.json.user.roleLabel, "Property manager");
    const rentals = await property("GET", "/api/buildings");
    assert.deepEqual(rentals.json.buildings.map(item => item.name), ["12 Clarendon Street rental"]);
    assert.equal(rentals.json.buildings[0].world, "private");
  } finally {
    await server.close();
  }
});
