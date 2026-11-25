import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { client, lastLink, startApp } from "./helpers.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("a work order, an extra, an invoice file and a fee invoice are kept", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const plumber = client(server.base);
  const other = client(server.base);
  try {
    await signIn(alex, server, {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const created = await alex("POST", "/api/buildings", {
      name: "Harbour View Apartments", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 41288"
    });
    await alex("PATCH", "/api/buildings/" + created.json.building.id, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 });
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const posted = await alex("POST", "/api/jobs", { buildingId: created.json.building.id, title: "Lobby tap", area: "Lobby", tradeId: "plumbing" });
    const quote = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/quotes", {
      price: 180, scope: ["Replace the washer"], date: "2026-12-02", time: "09:00", depositType: "none"
    });
    assert.equal((await alex("POST", "/api/jobs/" + posted.json.job.id + "/approve", { quoteId: quote.json.quoteId })).status, 200);
    const id = posted.json.job.id;
    const job = await alex("GET", "/api/jobs/" + id);
    assert.equal(job.json.job.workOrder, "WO-0001");
    const order = await alex("GET", "/api/jobs/" + id + "/documents/work-order");
    assert.match(order.text, /WO-0001/);
    assert.match(order.text, /Lobby tap/);
    assert.match(order.text, /Print or save as PDF/);
    const extra = await plumber("POST", "/api/jobs/" + id + "/variations", { amount: 40, reason: "Replace the ceramic disc as well" });
    assert.equal(extra.json.number, "WO-0001-V1");
    const approved = await alex("POST", "/api/jobs/" + id + "/variations/" + extra.json.id + "/approve", {});
    assert.equal(approved.json.agreedCents, 22000);
    const file = "data:application/pdf;base64," + Buffer.from("%PDF-1.1 invoice").toString("base64");
    const invoice = await plumber("POST", "/api/jobs/" + id + "/invoice-file", { number: "INV-9", amount: 220, fileName: "inv-9.pdf", data: file });
    assert.equal(invoice.json.status, "received");
    const sentBack = await alex("POST", "/api/jobs/" + id + "/invoices/" + invoice.json.id + "/return", { reason: "The date is missing" });
    assert.equal(sentBack.json.status, "returned");
    const again = await plumber("POST", "/api/jobs/" + id + "/invoice-file", { number: "INV-10", amount: 220, fileName: "inv-10.pdf", data: file });
    assert.equal(again.json.status, "received");
    const db = new DatabaseSync(server.config.databasePath, { readOnly: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM job_invoices").get().n, 2);
    assert.equal(db.prepare("SELECT status FROM job_invoices WHERE number = 'INV-9'").get().status, "returned");
    assert.ok(db.prepare("PRAGMA user_version").get().user_version >= 23);
    db.close();
    const fee = await plumber("GET", "/api/jobs/" + id + "/documents/fee");
    assert.equal(fee.status, 200);
    assert.match(fee.text, /TS-0001/);
    assert.match(fee.text, /not a tax invoice/);
    assert.equal((await alex("GET", "/api/jobs/" + id + "/documents/fee")).status, 403);
    await signIn(other, server, {
      kind: "manager", role: "building_manager", name: "Other Manager", email: "other@harbour.example",
      mobile: "0418000000", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    assert.equal((await other("GET", "/api/jobs/" + id + "/documents/work-order")).status, 404);
    const page = await (await fetch(server.base + "/")).text();
    assert.match(page, /View the TaskSpeck fee invoice/);
    assert.match(page, /basemaps\.cartocdn\.com/);
  } finally {
    await server.close();
  }
});
