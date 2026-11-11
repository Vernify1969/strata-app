import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { client, lastLink, startApp } from "./helpers.js";
import { alertDay, readDocumentBytes } from "../src/documents.js";

function signature(event) {
  const canonical = [event.id, event.type, event.paymentId, event.status].join("|");
  return createHmac("sha256", "test-webhook").update(canonical).digest("hex");
}

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

const managerBody = {
  kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
  mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
};
const plumberBody = {
  kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
  mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
};

async function openJob(server, urgency = "standard") {
  const manager = client(server.base);
  const plumber = client(server.base);
  await signIn(manager, server, managerBody);
  await manager("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "card", businessName: "Harbour View OC" });
  const building = await manager("POST", "/api/buildings", {
    name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
  });
  const job = await manager("POST", "/api/jobs", {
    buildingId: building.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing", urgency
  });
  await signIn(plumber, server, plumberBody);
  await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
  return { manager, plumber, jobId: job.json.job.id };
}

test("held money is not released before the job is complete, and the commission stays", async () => {
  const server = await startApp({ securityGate: true, commissionPercent: 10 });
  try {
    const { manager, jobId } = await openJob(server);
    const quote = await (await (async () => {
      const plumber = client(server.base);
      await signIn(plumber, server, { ...plumberBody, email: "sam2@plumbing.example" });
      await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
      return plumber("POST", "/api/jobs/" + jobId + "/quotes", {
        price: 400, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", depositType: "25"
      });
    })());
    const approved = await manager("POST", "/api/jobs/" + jobId + "/approve", { quoteId: quote.json.quoteId });
    assert.equal(approved.json.urgentFeeCents, 0);
    assert.equal(approved.json.commissionPercent, 10);
    const first = await manager("POST", "/api/jobs/" + jobId + "/payments", { idempotencyKey: "hold-deposit-1" });
    assert.equal(first.json.paid, false);
    assert.equal(first.json.released, false);
    assert.equal(first.json.feeCents, 1000);
    assert.equal(first.json.feeCents + first.json.netCents, first.json.amountCents);
    const early = await manager("POST", "/api/jobs/" + jobId + "/release", {});
    assert.equal(early.status, 400);
    const event = { id: "evt_hold", type: "payment_succeeded", paymentId: first.json.id, status: "succeeded" };
    const paid = await fetch(server.base + "/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-strata-signature": signature(event) },
      body: JSON.stringify(event)
    });
    assert.equal((await paid.json()).status, "succeeded");
    const still = await manager("POST", "/api/jobs/" + jobId + "/release", {});
    assert.equal(still.status, 400);
    assert.equal(server.app.locals.db.prepare("SELECT released_at FROM payments WHERE id = ?").get(first.json.id).released_at, "");
    server.app.locals.db.prepare("UPDATE jobs SET stage = 'accepted' WHERE id = ?").run(jobId);
    const released = await manager("POST", "/api/jobs/" + jobId + "/release", {});
    assert.equal(released.status, 200);
    assert.equal(released.json.released, true);
    assert.equal(released.json.payments[0].released, true);
    assert.equal(released.json.payments[0].feeCents, 1000);
    assert.match(released.json.payments[0].providerRef || "tr_test", /tr_test_|test_|pi_/);
    const row = server.app.locals.db.prepare("SELECT transfer_ref, fee_cents FROM payments WHERE id = ?").get(first.json.id);
    assert.match(row.transfer_ref, /^tr_test_/);
    assert.equal(row.fee_cents, 1000);
  } finally {
    await server.close();
  }
});

test("an after-hours job shows the extra fee before approval", async () => {
  const server = await startApp({ securityGate: true });
  try {
    const { manager, plumber, jobId } = await openJob(server, "after_hours");
    const quote = await plumber("POST", "/api/jobs/" + jobId + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", depositType: "none"
    });
    const approved = await manager("POST", "/api/jobs/" + jobId + "/approve", { quoteId: quote.json.quoteId });
    assert.equal(approved.json.urgent, true);
    assert.equal(approved.json.urgentFeeCents, 2500);
    assert.equal(approved.json.shownBeforeApproval, true);
  } finally {
    await server.close();
  }
});

test("the apartment fee is stored and switched off", async () => {
  const server = await startApp({
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" }
  });
  const owner = client(server.base);
  try {
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const settings = await owner("GET", "/api/owner/settings");
    assert.equal(settings.json.apartmentFeeEnabled, false);
    assert.equal(settings.json.apartmentFeeCharged, false);
    const turned = await owner("PATCH", "/api/owner/settings", { apartmentFeeCents: 500, apartmentFeeEnabled: false });
    assert.equal(turned.json.apartmentFeeEnabled, false);
    assert.equal(server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM payments").get().n, 0);
  } finally {
    await server.close();
  }
});

function pdf(text) {
  return Buffer.from(`%PDF-1.4\n(${text})\n%%EOF`).toString("base64");
}

test("an expired document blocks new offers, alerts go out at 30, 7 and 0 days, and files stay private", async () => {
  const read = readDocumentBytes(Buffer.from("%PDF-1.4\n(Licence: CDB-99 Expiry: 2027-06-01)\n%%EOF"), "application/pdf");
  assert.equal(read.suggestedExpiry, "2027-06-01");
  assert.equal(read.suggestedNumber, "CDB-99");
  assert.equal(alertDay("2026-12-01", "2026-11-01"), 30);
  assert.equal(alertDay("2026-12-01", "2026-11-24"), 7);
  assert.equal(alertDay("2026-12-01", "2026-12-01"), 0);
  assert.equal(alertDay("2026-12-01", "2026-11-02"), null);

  const server = await startApp({
    securityGate: true,
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" }
  });
  const manager = client(server.base);
  const plumber = client(server.base);
  const stranger = client(server.base);
  const otherTrade = client(server.base);
  const owner = client(server.base);
  try {
    await signIn(manager, server, managerBody);
    await manager("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "card", businessName: "Harbour View OC" });
    const building = await manager("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    await signIn(plumber, server, plumberBody);
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const refused = await plumber("POST", "/api/documents", {
      kind: "licence", mime: "application/pdf", filename: "licence.pdf", dataBase64: pdf("Licence: CDB-99 Expiry: 2020-01-01"), declaration: false
    });
    assert.equal(refused.status, 400);
    const expired = await plumber("POST", "/api/documents", {
      kind: "licence", mime: "application/pdf", filename: "licence.pdf",
      dataBase64: pdf("Licence: CDB-99 Expiry: 2020-01-01"), declaration: true, expiry: "2020-01-01"
    });
    assert.equal(expired.status, 201);
    assert.equal(expired.json.badge, "Documents checked (self-declared)");
    assert.equal(expired.json.register.available, false);
    const job = await manager("POST", "/api/jobs", {
      buildingId: building.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing"
    });
    const blocked = await plumber("POST", "/api/jobs/" + job.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", depositType: "none"
    });
    assert.equal(blocked.status, 403);
    assert.match(blocked.json.error, /expired/);
    const current = await plumber("POST", "/api/documents", {
      kind: "licence", mime: "application/pdf", filename: "licence.pdf",
      dataBase64: pdf("Licence: CDB-99 Expiry: 2026-12-01"), declaration: true
    });
    assert.equal(current.json.suggestions.suggestedExpiry, "2026-12-01");
    const offer = await plumber("POST", "/api/jobs/" + job.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", depositType: "none"
    });
    assert.equal(offer.status, 201);

    await signIn(stranger, server, { ...managerBody, email: "pat@other.example", name: "Pat Ellis" });
    const hidden = await stranger("GET", "/api/documents/" + current.json.document.id + "/file");
    assert.equal(hidden.status, 403);
    const seen = await manager("GET", "/api/documents/" + current.json.document.id + "/file");
    assert.equal(seen.status, 200);
    await signIn(otherTrade, server, { ...plumberBody, email: "other@plumbing.example", name: "Other Trade" });
    const rival = await otherTrade("GET", "/api/documents/" + current.json.document.id + "/file");
    assert.equal(rival.status, 403);

    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    for (const day of ["2026-11-01", "2026-11-24", "2026-12-01"]) {
      const run = await owner("POST", "/api/documents/alerts/run", { today: day });
      assert.equal(run.status, 200);
      assert.ok(run.json.sent >= 2);
    }
    const again = await owner("POST", "/api/documents/alerts/run", { today: "2026-12-01" });
    assert.equal(again.json.sent, 0);
    const notes = await plumber("GET", "/api/notifications");
    assert.ok(notes.json.notifications.length >= 3);
    const managerNotes = await manager("GET", "/api/notifications");
    assert.ok(managerNotes.json.notifications.length >= 3);
  } finally {
    await server.close();
  }
});
