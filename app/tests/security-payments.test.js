import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { client, lastLink, startApp } from "./helpers.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

async function bookedJob(server) {
  const manager = client(server.base);
  const plumber = client(server.base);
  await signIn(manager, server, {
    kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
    mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
  });
  await manager("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "card", businessName: "Harbour View OC" });
  const building = await manager("POST", "/api/buildings", {
    name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
  });
  const job = await manager("POST", "/api/jobs", { buildingId: building.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing" });
  await signIn(plumber, server, {
    kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
    mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
  });
  await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
  const quote = await plumber("POST", "/api/jobs/" + job.json.job.id + "/quotes", {
    price: 400, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", depositType: "25"
  });
  const approved = await manager("POST", "/api/jobs/" + job.json.job.id + "/approve", { quoteId: quote.json.quoteId });
  assert.equal(approved.json.paid, false);
  return { manager, jobId: job.json.job.id };
}

function signature(event) {
  const canonical = [event.id, event.type, event.paymentId, event.status].join("|");
  return createHmac("sha256", "test-webhook").update(canonical).digest("hex");
}

test("a payment cannot be created until the security tests pass, and a live key is refused", async () => {
  const server = await startApp({ securityGate: false });
  try {
    const { manager, jobId } = await bookedJob(server);
    const blocked = await manager("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "same-key-1" });
    assert.equal(blocked.status, 403);
  } finally {
    await server.close();
  }
  const live = await startApp({ stripeSecretKey: "sk_live_secret", securityGate: true });
  try {
    const { manager, jobId } = await bookedJob(live);
    const refused = await manager("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "same-key-1" });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /test keys only/);
  } finally {
    await live.close();
  }
});

test("money is marked paid only by a verified Stripe event, and a repeated request does not create a second charge", async () => {
  const server = await startApp({ securityGate: true });
  try {
    const { manager, jobId } = await bookedJob(server);
    const first = await manager("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "deposit-1" });
    assert.equal(first.status, 201);
    assert.equal(first.json.paid, false);
    assert.equal(first.json.holder, "stripe");
    assert.equal(first.json.status, "requires_payment");
    assert.equal(first.json.amountCents, 10000);
    assert.equal(first.json.feeCents + first.json.netCents, first.json.amountCents);
    const again = await manager("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "deposit-1" });
    assert.equal(again.json.id, first.json.id);
    const event = { id: "evt_1", type: "payment_succeeded", paymentId: first.json.id, status: "succeeded", providerRef: "pi_test_1" };
    const forged = await fetch(server.base + "/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-strata-signature": "nope" },
      body: JSON.stringify(event)
    });
    assert.equal(forged.status, 400);
    const verified = await fetch(server.base + "/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-strata-signature": signature(event) },
      body: JSON.stringify(event)
    });
    const body = await verified.json();
    assert.equal(verified.status, 200);
    assert.equal(body.status, "succeeded");
    const failed = { id: "evt_2", type: "payment_failed", paymentId: first.json.id, status: "failed", reason: "The card was declined." };
    const second = await manager("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "deposit-2" });
    const failEvent = { ...failed, paymentId: second.json.id };
    const fail = await fetch(server.base + "/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-strata-signature": signature(failEvent) },
      body: JSON.stringify(failEvent)
    });
    assert.equal((await fail.json()).status, "failed");
    const booked = server.app.locals.db.prepare("SELECT stage FROM jobs WHERE id = ?").get(jobId);
    assert.equal(booked.stage, "paid");
  } finally {
    await server.close();
  }
});
