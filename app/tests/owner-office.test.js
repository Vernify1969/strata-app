import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_OWNER } from "../src/demo-seed.js";
import { client, lastLink, startApp } from "./helpers.js";

const ownerBody = {
  kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
  mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
};

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("other roles are refused on every owner endpoint", async () => {
  const server = await startApp({ owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" } });
  const manager = client(server.base);
  const owner = client(server.base);
  try {
    await signIn(manager, server, ownerBody);
    const paths = [
      ["GET", "/api/owner/overview"],
      ["GET", "/api/owner/users"],
      ["GET", "/api/owner/users/x"],
      ["GET", "/api/owner/organisations"],
      ["GET", "/api/owner/buildings"],
      ["GET", "/api/owner/jobs"],
      ["GET", "/api/owner/jobs/x"],
      ["GET", "/api/owner/payments"],
      ["GET", "/api/owner/documents"],
      ["GET", "/api/owner/places"],
      ["GET", "/api/owner/ai"],
      ["GET", "/api/owner/holidays"],
      ["GET", "/api/owner/audit"],
      ["GET", "/api/owner/audit.csv"],
      ["POST", "/api/owner/users/x/suspend"],
      ["POST", "/api/owner/users/x/resend-verification"],
      ["POST", "/api/owner/users/x/send-reset"],
      ["POST", "/api/owner/users/x/strikes"],
      ["PATCH", "/api/owner/buildings/x/region"],
      ["POST", "/api/owner/payments/x/pause"],
      ["POST", "/api/owner/documents/x/review"],
      ["POST", "/api/owner/places/x/active"],
      ["POST", "/api/owner/reminders/run"]
    ];
    for (const [method, path] of paths) {
      const result = method === "GET" ? await manager(method, path) : await manager(method, path, {});
      assert.equal(result.status, 403, path);
    }
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const overview = await owner("GET", "/api/owner/overview");
    assert.equal(overview.status, 200);
    assert.match(overview.json.refunds, /not available yet/);
    const users = await owner("GET", "/api/owner/users?role=building_manager");
    assert.equal(JSON.stringify(users.json).includes("password_hash"), false);
    const person = users.json.users.find(item => item.email === "alex@harbour.example");
    const suspended = await owner("POST", "/api/owner/users/" + person.id + "/suspend", { suspended: true, reason: "Test hold" });
    assert.equal(suspended.json.suspended, true);
    assert.equal((await manager("GET", "/api/me")).status, 401);
    assert.equal((await manager("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" })).status, 403);
    assert.equal((await owner("POST", "/api/owner/users/" + person.id + "/suspend", { suspended: false, reason: "Back" })).json.suspended, false);
    const detail = await owner("GET", "/api/owner/users/" + person.id);
    assert.equal(detail.json.passwordIncluded, false);
    const reset = await owner("POST", "/api/owner/users/" + person.id + "/send-reset", {});
    assert.equal(reset.status, 200);
    assert.equal(JSON.stringify(reset.json).includes("password_hash"), false);
    const strike = await owner("POST", "/api/owner/users/" + person.id + "/strikes", { reason: "Not a contractor" });
    assert.equal(strike.status, 404);
  } finally {
    await server.close();
  }
});

test("the owner can pause a payout, review a document, disable a code, and export the log", async () => {
  const server = await startApp({
    securityGate: true,
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" }
  });
  const owner = client(server.base);
  const manager = client(server.base);
  const plumber = client(server.base);
  try {
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    await signIn(manager, server, ownerBody);
    await manager("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const building = await manager("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    await manager("PATCH", "/api/buildings/" + building.json.building.id, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 });
    const place = await manager("POST", "/api/buildings/" + building.json.building.id + "/places", { name: "Lift 1" });
    const region = await owner("PATCH", "/api/owner/buildings/" + building.json.building.id + "/region", { regionId: "AU-VIC" });
    assert.equal(region.json.regionId, "AU-VIC");
    const job = await manager("POST", "/api/jobs", { buildingId: building.json.building.id, title: "Tap", area: "Kitchen", tradeId: "plumbing" });
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    const doc = await plumber("POST", "/api/documents", {
      kind: "insurance", mime: "application/pdf", filename: "policy.pdf",
      dataBase64: Buffer.from("%PDF-1.4\n(Insurance policy POL-1 Expiry: 2027-06-01)\n%%EOF").toString("base64"),
      declaration: true, expiry: "2027-06-01"
    });
    const quote = await plumber("POST", "/api/jobs/" + job.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-12-01", time: "09:00", depositType: "none"
    });
    await manager("POST", "/api/jobs/" + job.json.job.id + "/approve", { quoteId: quote.json.quoteId });
    const db = server.app.locals.db;
    const org = db.prepare("SELECT organisation_id FROM jobs WHERE id = ?").get(job.json.job.id).organisation_id;
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at)
      VALUES ('pay-owner', ?, ?, 10000, 1500, 8500, 'succeeded', 'owner-pay', 'pi_owner', 'stripe', ?)`).run(job.json.job.id, org, new Date().toISOString());
    db.prepare("UPDATE jobs SET stage = 'accepted' WHERE id = ?").run(job.json.job.id);
    const paused = await owner("POST", "/api/owner/payments/pay-owner/pause", { paused: true, reason: "Hold the payout" });
    assert.equal(paused.json.paused, true);
    const release = await manager("POST", "/api/jobs/" + job.json.job.id + "/release", {});
    assert.equal(release.status, 400);
    const reviewed = await owner("POST", "/api/owner/documents/" + doc.json.document.id + "/review", { decision: "checked", note: "Name matches" });
    assert.equal(reviewed.json.selfDeclared, "Documents checked (self-declared)");
    assert.equal(reviewed.json.badge, "Owner checked");
    const off = await owner("POST", "/api/owner/places/" + place.json.place.id + "/active", { active: false });
    assert.equal(off.json.active, false);
    const holidays = await owner("GET", "/api/owner/holidays");
    assert.ok(holidays.json.holidays.some(day => day.note === "calculated, not yet official" || day.day.startsWith("2026-")));
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(new Date());
    const managerUser = db.prepare("SELECT id FROM users WHERE email = 'alex@harbour.example'").get();
    db.prepare(`INSERT INTO ai_uses (id, user_id, helper, model, demo, month, input_tokens, output_tokens, cost_cents, subject_type, subject_id, created_at)
      VALUES ('ai-billed', ?, 'triage', 'claude-haiku-5-5', 0, ?, 10, 10, 42, '', '', ?)`).run(managerUser.id, month, new Date().toISOString());
    db.prepare(`INSERT INTO ai_uses (id, user_id, helper, model, demo, month, input_tokens, output_tokens, cost_cents, subject_type, subject_id, created_at)
      VALUES ('ai-sample', ?, 'triage', '', 1, ?, 10, 10, 99, '', '', ?)`).run(managerUser.id, month, new Date().toISOString());
    const ai = await owner("GET", "/api/owner/ai");
    assert.equal(ai.json.available, true);
    assert.equal(ai.json.capCents, 500);
    const usage = ai.json.managers.find(row => row.email === "alex@harbour.example");
    assert.equal(usage.spentCents, 42);
    const log = await owner("GET", "/api/owner/audit?q=payout");
    assert.ok(log.json.events.some(event => event.action === "owner.payout_paused"));
    const csv = await owner("GET", "/api/owner/audit.csv");
    assert.match(csv.text, /owner.payout_paused/);
    const contractor = db.prepare("SELECT id FROM users WHERE email = 'sam@plumbing.example'").get();
    assert.equal((await owner("POST", "/api/owner/users/" + contractor.id + "/strikes", { reason: "Late paperwork" })).status, 201);
    const viewed = await owner("GET", "/api/owner/users/" + contractor.id);
    assert.equal(viewed.json.strikes.length, 1);
  } finally {
    await server.close();
  }
});

test("the demo includes a platform owner", async () => {
  const server = await startApp({ demoMode: true });
  const owner = client(server.base);
  try {
    const signed = await owner("POST", "/api/login", { email: DEMO_OWNER.email, password: DEMO_OWNER.password });
    assert.equal(signed.status, 200);
    assert.equal(signed.json.user.role, "platform_owner");
    assert.equal((await owner("GET", "/api/owner/overview")).status, 200);
  } finally {
    await server.close();
  }
});
