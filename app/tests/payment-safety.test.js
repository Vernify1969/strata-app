import test from "node:test";
import assert from "node:assert/strict";
import { captureExpiringHolds, holdAction } from "../src/payments.js";
import { translatePlaceholders } from "../src/sql.js";
import { POSTGRES_SCHEMA } from "../src/pg-schema.js";
import { saveObject, storageConfigured } from "../src/storage.js";
import { client, lastLink, startApp } from "./helpers.js";

test("a card hold is captured before it expires, and the contractor is not paid yet", async () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  assert.equal(holdAction({ status: "requires_capture", authorize_expires_at: soon, released_at: "" }), "capture");
  assert.equal(holdAction({ status: "requires_capture", authorize_expires_at: later, released_at: "" }), "none");
  assert.equal(holdAction({ status: "succeeded", authorize_expires_at: soon, released_at: "" }), "none");

  const captured = [];
  const server = await startApp({
    securityGate: true,
    capturePayment: async (payment) => captured.push(payment.id)
  });
  const manager = client(server.base);
  try {
    assert.equal((await manager("POST", "/api/register", {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    })).status, 201);
    const { link } = lastLink(server.config.outboxPath);
    await manager("GET", link.slice(link.indexOf("/api/")));
    await manager("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" });
    await manager("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const building = await manager("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    const job = await manager("POST", "/api/jobs", { buildingId: building.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing" });
    const db = server.app.locals.db;
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at, authorize_expires_at)
      VALUES ('hold1', ?, ?, 10000, 1500, 8500, 'requires_capture', 'hold-key-1', 'pi_test_hold', 'stripe', ?, ?)`).run(
      job.json.job.id, db.prepare("SELECT organisation_id FROM jobs WHERE id = ?").get(job.json.job.id).organisation_id,
      new Date().toISOString(), soon
    );
    assert.equal(await captureExpiringHolds(db, server.config), 1);
    assert.deepEqual(captured, ["hold1"]);
    const row = db.prepare("SELECT status, released_at, capture_requested_at FROM payments WHERE id = 'hold1'").get();
    assert.equal(row.status, "requires_capture");
    assert.equal(row.released_at, "");
    assert.ok(row.capture_requested_at);
    const missing = await fetch(server.base + "/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "nope" },
      body: "{}"
    });
    assert.equal(missing.status, 400);
  } finally {
    await server.close();
  }
});

test("uploaded files stay on disk until object storage is configured", async () => {
  assert.equal(storageConfigured({}), false);
  assert.equal(translatePlaceholders("SELECT id FROM users WHERE email = ? AND role = ?").text, "SELECT id FROM users WHERE email = $1 AND role = $2");
  assert.match(POSTGRES_SCHEMA, /CREATE TABLE IF NOT EXISTS payments/);
  const saved = [];
  const config = {
    root: "/tmp",
    databasePath: "/tmp/strata.db",
    storageClient: {
      async put(key, bytes) { saved.push({ key, bytes }); },
      async get(key) { return saved.find(item => item.key === key)?.bytes || null; }
    }
  };
  const body = Buffer.from("licence");
  const stored = await saveObject(config, "document", "doc.pdf", body, "application/pdf");
  assert.equal(stored.where, "s3");
  assert.equal(String(await config.storageClient.get("document/doc.pdf")), "licence");
});
