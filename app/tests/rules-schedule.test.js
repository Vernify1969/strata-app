import test from "node:test";
import assert from "node:assert/strict";
import { announcedOnly, CALCULATED_NOTE, holidaysForDatabase, officialHolidays, victoriaHolidays } from "../src/holidays.js";
import { dueAlertDays } from "../src/documents.js";
import { releaseExpiredReviews, runMaintenance } from "../src/maintenance.js";
import { client, lastLink, startApp } from "./helpers.js";

const CHECK_YEARS = [2019, 2020, 2022, 2023, 2026, 2027, 2028];

test("the holiday rule matches the official Victoria lists, without announced one-off days", () => {
  for (const year of CHECK_YEARS) {
    const official = officialHolidays(year).map(row => row[0]);
    const calculated = victoriaHolidays(year).map(row => row[0]);
    assert.deepEqual(calculated, official.filter(day => !announcedOnly(day)));
  }
  assert.equal(officialHolidays(2027).some(row => row[0] === "2027-04-26"), false);
  assert.equal(officialHolidays(2026).some(row => row[0] === "2026-09-25"), true);
  assert.equal(officialHolidays(2028).some(row => row[1].includes("AFL")), false);
  const later = holidaysForDatabase(new Date("2026-11-18T00:00:00Z"));
  assert.ok(later.some(row => row.day.startsWith("2029-") && row.note === CALCULATED_NOTE));
  assert.ok(later.some(row => row.day === "2026-09-25" && row.note === ""));
});

test("a missed document reminder is sent once, and a finished review releases the payment", async () => {
  assert.deepEqual(dueAlertDays("2026-12-01", "2026-11-11"), [30]);
  assert.deepEqual(dueAlertDays("2026-12-01", "2026-12-02"), [30, 7, 0]);
  const server = await startApp();
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
    const created = await manager("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    const blocked = await manager("POST", "/api/jobs", {
      buildingId: created.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing"
    });
    const plumber = client(server.base);
    assert.equal((await plumber("POST", "/api/register", {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    })).status, 201);
    const verify = lastLink(server.config.outboxPath);
    await plumber("GET", verify.link.slice(verify.link.indexOf("/api/")));
    await plumber("POST", "/api/login", { email: "sam@plumbing.example", password: "Pipes123" });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const quote = await plumber("POST", "/api/jobs/" + blocked.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-12-01", time: "09:00", depositType: "none"
    });
    const refused = await manager("POST", "/api/jobs/" + blocked.json.job.id + "/approve", { quoteId: quote.json.quoteId });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /Set all three budgets/);
    assert.equal((await manager("PATCH", "/api/buildings/" + created.json.building.id, {
      tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3
    })).status, 200);
    assert.equal((await manager("POST", "/api/jobs/" + blocked.json.job.id + "/approve", { quoteId: quote.json.quoteId })).status, 200);

    const db = server.app.locals.db;
    const user = db.prepare("SELECT id FROM users WHERE email = 'sam@plumbing.example'").get();
    db.prepare(`INSERT INTO contractor_documents
      (id, user_id, kind, stored_name, original_name, mime, declared, declared_at, expiry_on, licence_number, suggested_expiry, suggested_number, suggested_kind, created_at)
      VALUES ('doc1', ?, 'licence', 'doc1.pdf', 'licence.pdf', 'application/pdf', 1, '2026-11-01T00:00:00.000Z', '2026-12-01', '', '', '', '', '2026-11-01T00:00:00.000Z')`).run(user.id);
    const first = await runMaintenance(db, server.app.locals.mail, server.config, new Date("2026-11-11T00:00:00Z"));
    assert.ok(first.alerts >= 1);
    const second = await runMaintenance(db, server.app.locals.mail, server.config, new Date("2026-11-11T00:00:00Z"));
    assert.equal(second.alerts, 0);

    const jobId = blocked.json.job.id;
    db.prepare("UPDATE jobs SET stage = 'review0', review_ends_at = '2026-11-01T00:00:00.000Z', contractor_user_id = ? WHERE id = ?").run(user.id, jobId);
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at, kind, urgent_fee_cents)
      VALUES ('pay1', ?, ?, 10000, 1500, 8500, 'succeeded', 'maint-1', 'pi_test', 'stripe', '2026-11-01T00:00:00.000Z', 'full', 0)`).run(
      jobId, db.prepare("SELECT organisation_id FROM jobs WHERE id = ?").get(jobId).organisation_id
    );
    assert.equal(await releaseExpiredReviews(db, server.config, new Date("2026-11-02T00:00:00.000Z")), 1);
    assert.equal(db.prepare("SELECT stage FROM jobs WHERE id = ?").get(jobId).stage, "released");
    assert.ok(db.prepare("SELECT released_at FROM payments WHERE id = 'pay1'").get().released_at);
    assert.equal(await releaseExpiredReviews(db, server.config, new Date("2026-11-03T00:00:00.000Z")), 0);
  } finally {
    await server.close();
  }
});
