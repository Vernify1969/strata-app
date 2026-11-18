import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { watchDeposits } from "../src/maintenance.js";
import { client, lastLink, startApp } from "./helpers.js";

const WEBHOOK_SECRET = "whsec_test_secret";

function signedEvent(event) {
  const payload = JSON.stringify(event);
  const header = new Stripe("sk_test_webhook_only").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, header };
}

test("an unpaid deposit is reminded and then lapses, and funds show only after Stripe confirms", async () => {
  const server = await startApp({
    securityGate: true,
    stripeWebhookSecret: WEBHOOK_SECRET,
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" }
  });
  const owner = client(server.base);
  const manager = client(server.base);
  const plumber = client(server.base);
  try {
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const before = await owner("GET", "/api/owner/settings");
    assert.equal(before.json.depositHours, 48);
    assert.equal(before.json.urgentDepositHours, 12);
    const changed = await owner("PATCH", "/api/owner/settings", { depositHours: 48, urgentDepositHours: 12 });
    assert.equal(changed.json.depositHours, 48);

    assert.equal((await manager("POST", "/api/register", {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    })).status, 201);
    const managerLink = lastLink(server.config.outboxPath);
    await manager("GET", managerLink.link.slice(managerLink.link.indexOf("/api/")));
    await manager("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" });
    await manager("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const building = await manager("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    await manager("PATCH", "/api/buildings/" + building.json.building.id, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 });
    const job = await manager("POST", "/api/jobs", {
      buildingId: building.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing", urgency: "urgent"
    });
    assert.equal((await plumber("POST", "/api/register", {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    })).status, 201);
    const plumberLink = lastLink(server.config.outboxPath);
    await plumber("GET", plumberLink.link.slice(plumberLink.link.indexOf("/api/")));
    await plumber("POST", "/api/login", { email: "sam@plumbing.example", password: "Pipes123" });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const quote = await plumber("POST", "/api/jobs/" + job.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-12-01", time: "09:00", depositType: "25"
    });
    const approved = await manager("POST", "/api/jobs/" + job.json.job.id + "/approve", { quoteId: quote.json.quoteId });
    assert.equal(approved.json.stage, "approved");
    const seen = await plumber("GET", "/api/jobs/" + job.json.job.id);
    assert.equal(seen.json.job.fundsStatus, "Waiting for deposit – do not start work");

    const db = server.app.locals.db;
    const dueSoon = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    db.prepare("UPDATE jobs SET deposit_due_at = ? WHERE id = ?").run(dueSoon, job.json.job.id);
    const reminded = await watchDeposits(db, server.app.locals.mail, server.config, new Date());
    assert.equal(reminded.reminded, 1);
    assert.equal(reminded.lapsed, 0);
    const again = await watchDeposits(db, server.app.locals.mail, server.config, new Date());
    assert.equal(again.reminded, 0);
    const paymentsBefore = db.prepare("SELECT COUNT(*) AS n FROM payments").get().n;

    db.prepare("UPDATE jobs SET deposit_due_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), job.json.job.id);
    const lapsed = await watchDeposits(db, server.app.locals.mail, server.config, new Date());
    assert.equal(lapsed.lapsed, 1);
    assert.equal(db.prepare("SELECT stage FROM jobs WHERE id = ?").get(job.json.job.id).stage, "open");
    assert.equal(db.prepare("SELECT status FROM quotes WHERE id = ?").get(quote.json.quoteId).status, "open");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payments").get().n, paymentsBefore);
    const mail = server.app.locals.mail.readAll();
    assert.ok(mail.some(item => item.to === "sam@plumbing.example" && item.subject === "The approval has lapsed"));
    assert.ok(mail.some(item => item.subject === "The deposit is still unpaid"));

    const againQuote = await plumber("POST", "/api/jobs/" + job.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-12-01", time: "09:00", depositType: "25"
    });
    assert.equal((await manager("POST", "/api/jobs/" + job.json.job.id + "/approve", { quoteId: againQuote.json.quoteId })).status, 200);
    const payment = await manager("POST", "/api/jobs/" + job.json.job.id + "/payments", { idempotencyKey: "deposit-proof-1" });
    assert.equal((await plumber("GET", "/api/jobs/" + job.json.job.id)).json.job.fundsStatus, "Waiting for deposit – do not start work");
    const signed = signedEvent({
      id: "evt_funds",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_funds", metadata: { paymentId: payment.json.id }, status: "succeeded" } }
    });
    const confirmed = await fetch(server.base + "/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signed.header },
      body: signed.payload
    });
    assert.equal((await confirmed.json()).status, "succeeded");
    assert.equal((await plumber("GET", "/api/jobs/" + job.json.job.id)).json.job.fundsStatus, "Funds secured by Stripe – OK to start");
    assert.ok(server.app.locals.mail.readAll().some(item => item.subject === "Funds secured by Stripe" && item.to === "sam@plumbing.example"));
  } finally {
    await server.close();
  }
});
