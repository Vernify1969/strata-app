import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { client, lastLink, startApp } from "./helpers.js";
import { chaseMissingInvoices, sendScheduledReports } from "../src/reports-pack.js";

function outbox(server) {
  return fs.readFileSync(server.config.outboxPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
}

function melbourneDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function previousMonth(day) {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("managers get frozen reports, owner statements and a polite invoice reminder", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const plumber = client(server.base);
  const pat = client(server.base);
  const other = client(server.base);
  const month = previousMonth(melbourneDay());
  try {
    await signIn(alex, server, {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@reports.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const created = await alex("POST", "/api/buildings", {
      name: "Harbour View Apartments", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 41288"
    });
    const buildingId = created.json.building.id;
    assert.equal((await alex("PATCH", "/api/buildings/" + buildingId, { committeeEmails: "not-an-email" })).status, 400);
    const saved = await alex("PATCH", "/api/buildings/" + buildingId, { committeeEmails: "committee@harbour.example, minutes@harbour.example" });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.building.committeeEmails, "committee@harbour.example, minutes@harbour.example");
    assert.equal((await alex("PATCH", "/api/buildings/" + buildingId, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 })).status, 200);
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam-reports@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    assert.equal((await plumber("GET", "/api/reports/summary")).status, 403);
    assert.equal((await plumber("PATCH", "/api/me/report-schedule", { schedule: "monthly" })).status, 403);
    const posted = await alex("POST", "/api/jobs", { buildingId, title: "October boiler", area: "Plant room", tradeId: "plumbing" });
    const quote = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/quotes", {
      price: 180, scope: ["Service the boiler"], date: "2026-10-15", time: "09:00", depositType: "none"
    });
    assert.equal((await alex("POST", "/api/jobs/" + posted.json.job.id + "/approve", { quoteId: quote.json.quoteId })).status, 200);
    const db = new DatabaseSync(server.config.databasePath);
    db.prepare("UPDATE jobs SET stage = 'released', approved_cents = 18000, closed_at = ? WHERE id = ?").run(month + "-15T00:00:00.000Z", posted.json.job.id);
    db.prepare(`INSERT INTO job_invoices (id, job_id, number, amount_cents, gst, status, return_reason, stored_name, original_name, content_type, created_at)
      VALUES ('inv-oct', ?, 'INV-OCT', 18000, 0, 'received', '', '', 'inv.pdf', 'application/pdf', ?)`).run(posted.json.job.id, month + "-16T00:00:00.000Z");
    const summary = await alex("GET", "/api/reports/summary?kind=monthly&month=" + month);
    assert.equal(summary.status, 200);
    assert.match(summary.text, /Monthly summary/);
    assert.match(summary.text, /October boiler/);
    assert.match(summary.text, /Print or save as PDF/);
    const csv = await alex("GET", "/api/reports/summary.csv?kind=monthly&month=" + month);
    assert.match(csv.text, /October boiler/);
    assert.match(csv.text, /180\.00/);
    const pdf = await alex("GET", "/api/reports/summary.pdf?kind=monthly&month=" + month);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.text.slice(0, 5), "%PDF-");
    assert.match(pdf.text, /October boiler/);
    assert.equal((await alex("POST", "/api/buildings/" + buildingId + "/committee-report/submit", { month: melbourneDay().slice(0, 7) })).status, 400);
    const due = await alex("GET", "/api/reports/due");
    assert.ok(due.json.committee.some(row => row.buildingId === buildingId));
    const submitted = await alex("POST", "/api/buildings/" + buildingId + "/committee-report/submit", { month });
    assert.equal(submitted.status, 201);
    assert.deepEqual(submitted.json.sentTo, ["committee@harbour.example", "minutes@harbour.example"]);
    const letters = outbox(server).filter(message => message.subject.startsWith("Monthly Maintenance Report " + month));
    assert.equal(letters.length, 2);
    db.prepare("UPDATE jobs SET title = 'Changed boiler' WHERE id = ?").run(posted.json.job.id);
    const frozen = await alex("GET", "/api/reports/submitted/" + submitted.json.id);
    assert.match(frozen.text, /October boiler/);
    assert.doesNotMatch(frozen.text, /Changed boiler/);
    assert.equal((await alex("POST", "/api/buildings/" + buildingId + "/committee-report/submit", { month })).status, 400);
    const afterDue = await alex("GET", "/api/reports/due");
    assert.equal(afterDue.json.committee.some(row => row.buildingId === buildingId), false);
    await signIn(other, server, {
      kind: "manager", role: "building_manager", name: "Other Manager", email: "other-reports@harbour.example",
      mobile: "0418000000", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    assert.equal((await other("GET", "/api/buildings/" + buildingId + "/committee-report?month=" + month)).status, 404);
    assert.equal((await other("GET", "/api/reports/submitted/" + submitted.json.id)).status, 404);

    await signIn(pat, server, {
      kind: "manager", role: "property_manager", name: "Pat Ellis", email: "pat-reports@rentals.example",
      mobile: "0418333444", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await pat("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Pat Lettings" });
    const shop = await pat("POST", "/api/buildings", {
      name: "Chapel Shop", streetNumber: "12", street: "Chapel Street", suburb: "Prahran", postcode: "3181"
    });
    const shopId = shop.json.building.id;
    assert.equal((await pat("GET", "/api/buildings/" + shopId + "/committee-report")).status, 400);
    assert.equal((await pat("PATCH", "/api/buildings/" + shopId, { ownerName: "Ada Owner", ownerEmail: "ada@owner.example" })).status, 200);
    const rentalJob = await pat("POST", "/api/jobs", { buildingId: shopId, title: "Shop tap", area: "Kitchen", tradeId: "plumbing" });
    const rentalQuote = await plumber("POST", "/api/jobs/" + rentalJob.json.job.id + "/quotes", {
      price: 90, scope: ["Replace the washer"], date: "2026-10-20", time: "11:00", depositType: "none"
    });
    assert.equal((await pat("POST", "/api/jobs/" + rentalJob.json.job.id + "/approve", { quoteId: rentalQuote.json.quoteId })).status, 200);
    db.prepare("UPDATE jobs SET stage = 'released', approved_cents = 9000, closed_at = ? WHERE id = ?").run(month + "-20T00:00:00.000Z", rentalJob.json.job.id);
    db.prepare(`INSERT INTO job_invoices (id, job_id, number, amount_cents, gst, status, return_reason, stored_name, original_name, content_type, created_at)
      VALUES ('inv-shop', ?, 'INV-SHOP', 9000, 0, 'received', '', '', 'shop.pdf', 'application/pdf', ?)`).run(rentalJob.json.job.id, month + "-21T00:00:00.000Z");
    const statement = await pat("GET", "/api/buildings/" + shopId + "/owner-statement?month=" + month);
    assert.match(statement.text, /Owner statement/);
    assert.match(statement.text, /Shop tap/);
    assert.match(statement.text, /limited to 14 days/);
    const sentStatement = await pat("POST", "/api/buildings/" + shopId + "/owner-statement/send", { month });
    assert.equal(sentStatement.status, 201);
    assert.equal(sentStatement.json.sentTo, "ada@owner.example");
    const jobReport = await pat("POST", "/api/jobs/" + rentalJob.json.job.id + "/job-report/send", {});
    assert.equal(jobReport.status, 201);
    const kept = await pat("GET", "/api/reports/submitted/" + jobReport.json.id);
    assert.match(kept.text, /Shop tap/);

    const late = await alex("POST", "/api/jobs", { buildingId, title: "Uninvoiced drain", area: "Car park", tradeId: "plumbing" });
    const lateQuote = await plumber("POST", "/api/jobs/" + late.json.job.id + "/quotes", {
      price: 70, scope: ["Clear the drain"], date: "2026-11-02", time: "08:00", depositType: "none"
    });
    assert.equal((await alex("POST", "/api/jobs/" + late.json.job.id + "/approve", { quoteId: lateQuote.json.quoteId })).status, 200);
    db.prepare("UPDATE jobs SET stage = 'accepted', created_at = '2026-11-01T00:00:00.000Z' WHERE id = ?").run(late.json.job.id);
    const firstChase = new Date("2026-11-20T00:00:00.000Z");
    assert.equal(await chaseMissingInvoices(db, server.app.locals.mail, firstChase), 1);
    assert.equal(await chaseMissingInvoices(db, server.app.locals.mail, firstChase), 0);
    assert.equal(await chaseMissingInvoices(db, server.app.locals.mail, new Date("2026-11-28T00:00:00.000Z")), 1);
    const reminders = outbox(server).filter(message => message.text.includes("Uninvoiced drain"));
    assert.equal(reminders.length, 2);
    assert.match(reminders[0].text, /polite reminder/);
    assert.match(reminders[0].text, /can still post new jobs/);
    assert.equal(db.prepare("SELECT payments_paused FROM buildings WHERE id = ?").get(buildingId).payments_paused, 0);
    assert.equal((await alex("POST", "/api/jobs", { buildingId, title: "Another tap", area: "Kitchen", tradeId: "plumbing" })).status, 201);
    assert.equal((await alex("PATCH", "/api/me/report-schedule", { schedule: "monthly" })).status, 200);
    assert.equal(await sendScheduledReports(db, server.app.locals.mail, new Date("2026-12-01T00:00:00.000Z")), 1);
    assert.equal(await sendScheduledReports(db, server.app.locals.mail, new Date("2026-12-01T00:00:00.000Z")), 0);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 27);
    db.close();
    const page = await (await fetch(server.base + "/")).text();
    assert.match(page, /Maintenance reports/);
    assert.match(page, /Monthly Maintenance Report/);
    assert.match(page, /height: 360px/);
    assert.match(page, /height: 220px/);
    assert.doesNotMatch(page, /#06122E/);
    assert.doesNotMatch(page, /welcome-brand/);
  } finally {
    await server.close();
  }
});
