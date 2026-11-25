import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { client, startApp } from "./helpers.js";
import { chaseOverdueRequests } from "../src/payment-requests.js";

function outbox(server) {
  const text = fs.readFileSync(server.config.outboxPath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map(line => JSON.parse(line));
}

function plusDays(days) {
  const [year, month, day] = new Date().toISOString().slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const link = outbox(server).at(-1).text.match(/https?:\/\/\S+/)[0];
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("payment requests can be sent, retried, released, closed, refunded and paused", async () => {
  const server = await startApp({ owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" } });
  const alex = client(server.base);
  const plumber = client(server.base);
  const owner = client(server.base);
  try {
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const before = await owner("GET", "/api/owner/settings");
    assert.equal(before.json.gstOnFee, false);
    assert.equal(before.json.maxPayDays, 14);
    assert.equal(before.json.overduePauseDays, 7);
    await signIn(alex, server, {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const created = await alex("POST", "/api/buildings", {
      name: "Harbour View Apartments", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 41288"
    });
    const buildingId = created.json.building.id;
    assert.equal((await alex("PATCH", "/api/buildings/" + buildingId, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 })).status, 200);
    const tooLong = await alex("PATCH", "/api/buildings/" + buildingId, { payer: "accounts", paymentEmail: "accounts@harbour.example", paymentTermsDays: 21 });
    assert.equal(tooLong.status, 400);
    assert.equal((await owner("PATCH", "/api/owner/settings", { maxPayDays: 21 })).status, 200);
    const terms = await alex("PATCH", "/api/buildings/" + buildingId, { payer: "accounts", paymentEmail: "accounts@harbour.example", paymentTermsDays: 14 });
    assert.equal(terms.status, 200);
    assert.equal(terms.json.building.payer, "accounts");
    assert.equal(terms.json.building.paymentEmail, "accounts@harbour.example");
    assert.equal(terms.json.building.paymentTermsDays, 14);
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });

    const posted = await alex("POST", "/api/jobs", { buildingId, title: "Lobby tap", area: "Lobby", tradeId: "plumbing" });
    const jobId = posted.json.job.id;
    const quote = await plumber("POST", "/api/jobs/" + jobId + "/quotes", {
      price: 180, scope: ["Replace the washer"], date: "2026-12-02", time: "09:00", depositType: "none"
    });
    assert.equal((await alex("POST", "/api/jobs/" + jobId + "/approve", { quoteId: quote.json.quoteId })).status, 200);
    assert.equal((await plumber("POST", "/api/jobs/" + jobId + "/payment-requests", {})).status, 404);
    const request = await alex("POST", "/api/jobs/" + jobId + "/payment-requests", {});
    assert.equal(request.status, 201);
    assert.equal(request.json.number, "PR-0001-1");
    assert.equal(request.json.kind, "final");
    assert.equal(request.json.amountCents, 18000);
    assert.equal(request.json.dueOn, plusDays(14));
    const sent = await alex("POST", "/api/jobs/" + jobId + "/payment-requests/" + request.json.id + "/send", {});
    assert.equal(sent.json.status, "sent");
    assert.equal(sent.json.payerEmail, "accounts@harbour.example");
    const again = await alex("POST", "/api/jobs/" + jobId + "/payment-requests/" + request.json.id + "/send", {});
    assert.equal(again.json.status, "sent");
    const subjects = outbox(server).map(message => message.subject);
    assert.equal(subjects.filter(subject => subject === "Payment request PR-0001-1").length, 1);
    assert.equal(subjects.filter(subject => subject === "Payment request sent again: PR-0001-1").length, 1);

    const failed = await alex("POST", "/api/jobs/" + jobId + "/payment-requests/" + request.json.id + "/pay", { idempotencyKey: "fail-key-1", outcome: "fail" });
    assert.equal(failed.status, 402);
    assert.equal(failed.json.failed, true);
    const same = await alex("POST", "/api/jobs/" + jobId + "/payment-requests/" + request.json.id + "/pay", { idempotencyKey: "fail-key-1", outcome: "fail" });
    assert.equal(same.status, 200);
    assert.equal(same.json.repeated, true);
    assert.equal(same.json.status, "failed");
    const paid = await alex("POST", "/api/jobs/" + jobId + "/payment-requests/" + request.json.id + "/pay", { idempotencyKey: "pay-key-1" });
    assert.equal(paid.status, 201);
    assert.equal(paid.json.status, "succeeded");
    assert.equal(paid.json.repeated, false);
    assert.equal(paid.json.request.status, "paid");
    const db = server.app.locals.db;
    const payment = db.prepare("SELECT * FROM payments WHERE idempotency_key = 'pay-key-1'").get();
    assert.equal(payment.fee_cents, 2700);
    assert.equal(payment.released_at, "");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payments WHERE job_id = ?").get(jobId).n, 2);

    const file = "data:application/pdf;base64," + Buffer.from("%PDF-1.1 invoice").toString("base64");
    const invoice = await plumber("POST", "/api/jobs/" + jobId + "/invoice-file", { number: "INV-9", amount: 180, fileName: "inv-9.pdf", data: file });
    assert.equal(invoice.json.status, "received");
    assert.equal((await alex("POST", "/api/jobs/" + jobId + "/close", {})).status, 400);
    db.prepare("UPDATE jobs SET stage = 'accepted' WHERE id = ?").run(jobId);
    const ready = await alex("GET", "/api/jobs/" + jobId);
    assert.equal(ready.json.job.closeState, "ready");
    assert.equal((await alex("POST", "/api/jobs/" + jobId + "/close", {})).status, 200);
    const closed = await alex("GET", "/api/jobs/" + jobId);
    assert.equal(closed.json.job.closeState, "closed");
    assert.equal(closed.json.job.workOrder, "WO-0001");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quotes WHERE job_id = ?").get(jobId).n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM job_invoices WHERE job_id = ?").get(jobId).n, 1);
    assert.ok(db.prepare("SELECT released_at FROM payments WHERE id = ?").get(payment.id).released_at);

    assert.equal((await alex("POST", "/api/owner/payments/" + payment.id + "/refund", { amountCents: 1000, reason: "Goodwill" })).status, 403);
    const refund = await owner("POST", "/api/owner/payments/" + payment.id + "/refund", { amountCents: 1000, reason: "Goodwill" });
    assert.equal(refund.json.refundedCents, 1000);
    assert.equal(refund.json.full, false);
    assert.equal(refund.json.remainingCents, 17000);
    const tooMuch = await owner("POST", "/api/owner/payments/" + payment.id + "/refund", { amountCents: 20000, reason: "Too much" });
    assert.equal(tooMuch.status, 400);
    const dispute = await owner("POST", "/api/owner/payments/" + payment.id + "/dispute", { status: "open", reason: "The cardholder queried it" });
    assert.equal(dispute.json.payoutPaused, true);
    assert.equal(db.prepare("SELECT payout_paused FROM payments WHERE id = ?").get(payment.id).payout_paused, 1);
    const won = await owner("POST", "/api/owner/payments/" + payment.id + "/dispute", { status: "won", reason: "The bank closed it" });
    assert.equal(won.json.payoutPaused, false);
    const gst = await owner("PATCH", "/api/owner/settings", { gstOnFee: true });
    assert.equal(gst.json.gstOnFee, true);
    const fee = await plumber("GET", "/api/jobs/" + jobId + "/documents/fee");
    assert.match(fee.text, /Tax invoice/);
    assert.match(fee.text, /GST on the fee/);
    assert.equal((await owner("PATCH", "/api/owner/settings", { gstOnFee: false })).json.gstOnFee, false);

    const depositJob = await alex("POST", "/api/jobs", { buildingId, title: "Basin tap", area: "Bathroom", tradeId: "plumbing" });
    const depositQuote = await plumber("POST", "/api/jobs/" + depositJob.json.job.id + "/quotes", {
      price: 180, scope: ["Replace the washer"], date: "2026-12-03", time: "10:00", depositType: "25"
    });
    assert.equal((await alex("POST", "/api/jobs/" + depositJob.json.job.id + "/approve", { quoteId: depositQuote.json.quoteId })).status, 200);
    const depositRequest = await alex("POST", "/api/jobs/" + depositJob.json.job.id + "/payment-requests", {});
    assert.equal(depositRequest.json.kind, "deposit");
    assert.equal(depositRequest.json.amountCents, 4500);
    assert.equal(depositRequest.json.number, "PR-0002-1");
    await alex("POST", "/api/jobs/" + depositJob.json.job.id + "/payment-requests/" + depositRequest.json.id + "/send", {});
    const depositPaid = await alex("POST", "/api/jobs/" + depositJob.json.job.id + "/payment-requests/" + depositRequest.json.id + "/pay", { idempotencyKey: "deposit-key-1" });
    assert.equal(depositPaid.status, 201);
    assert.equal(db.prepare("SELECT released_at FROM payments WHERE idempotency_key = 'deposit-key-1'").get().released_at, "");
    db.prepare("UPDATE jobs SET arrival_status = 'arrived' WHERE id = ?").run(depositJob.json.job.id);
    assert.equal((await alex("POST", "/api/jobs/" + depositJob.json.job.id + "/confirm-arrival", {})).status, 200);
    assert.ok(db.prepare("SELECT released_at FROM payments WHERE idempotency_key = 'deposit-key-1'").get().released_at);

    const lateJob = await alex("POST", "/api/jobs", { buildingId, title: "Garden tap", area: "Garden", tradeId: "plumbing" });
    const lateQuote = await plumber("POST", "/api/jobs/" + lateJob.json.job.id + "/quotes", {
      price: 90, scope: ["Replace the washer"], date: "2026-12-04", time: "11:00", depositType: "none"
    });
    assert.equal((await alex("POST", "/api/jobs/" + lateJob.json.job.id + "/approve", { quoteId: lateQuote.json.quoteId })).status, 200);
    const lateRequest = await alex("POST", "/api/jobs/" + lateJob.json.job.id + "/payment-requests", {});
    await alex("POST", "/api/jobs/" + lateJob.json.job.id + "/payment-requests/" + lateRequest.json.id + "/send", {});
    db.prepare("UPDATE payment_requests SET due_on = '2020-01-01' WHERE id = ?").run(lateRequest.json.id);
    assert.equal(await chaseOverdueRequests(db, server.app.locals.mail, server.config, new Date("2020-01-10T00:00:00Z")), 1);
    assert.equal(db.prepare("SELECT payments_paused FROM buildings WHERE id = ?").get(buildingId).payments_paused, 1);
    const blocked = await alex("POST", "/api/jobs", { buildingId, title: "Another tap", area: "Kitchen", tradeId: "plumbing" });
    assert.equal(blocked.status, 400);
    assert.match(blocked.json.error, /overdue/);
    assert.equal((await alex("POST", "/api/jobs/" + lateJob.json.job.id + "/payment-requests/" + lateRequest.json.id + "/pay", { idempotencyKey: "late-key-1" })).status, 201);
    assert.equal(await chaseOverdueRequests(db, server.app.locals.mail, server.config, new Date("2020-01-11T00:00:00Z")), 0);
    assert.equal(db.prepare("SELECT payments_paused FROM buildings WHERE id = ?").get(buildingId).payments_paused, 0);
    assert.equal((await alex("POST", "/api/jobs", { buildingId, title: "Another tap", area: "Kitchen", tradeId: "plumbing" })).status, 201);

    const version = new DatabaseSync(server.config.databasePath, { readOnly: true });
    assert.equal(version.prepare("PRAGMA user_version").get().user_version, 24);
    version.close();
    const page = await (await fetch(server.base + "/")).text();
    assert.match(page, /Payment failed/);
    assert.match(page, /Try the payment again/);
    assert.match(page, /Close job/);
    assert.match(page, /Who pays/);
    assert.match(page, /basemaps\.cartocdn\.com/);
    assert.doesNotMatch(page, /tile\.openstreetmap\.org/);
  } finally {
    await server.close();
  }
});
