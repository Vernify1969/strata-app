import test from "node:test";
import assert from "node:assert/strict";
import { HAIKU, SONNET, estimateAudCents, redactContacts } from "../src/ai.js";
import { client, lastLink, startApp } from "./helpers.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

const manager = {
  kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
  mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
};

test("sample answers are labelled drafts and do not change the report", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const guest = client(server.base);
  try {
    await signIn(alex, server, manager);
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const building = await alex("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    const place = await alex("POST", "/api/buildings/" + building.json.building.id + "/places", { name: "Lift 1", kind: "lift" });
    const created = await guest("POST", "/api/public/reports", {
      token: place.json.place.token, description: "The lift door stays open. Email rita@example.com or 0412000111",
      kind: "lift", name: "Rita Resident", contact: "rita@example.com", consent: true,
      botA: 2, botB: 3, botAnswer: 5, idempotencyKey: "ai-report-1"
    });
    assert.equal(created.status, 201);
    const report = server.app.locals.db.prepare("SELECT id, status FROM reports WHERE reference = ?").get(created.json.reference);
    const draft = await alex("POST", "/api/ai/triage", { reportId: report.id });
    assert.equal(draft.status, 200);
    assert.equal(draft.json.draft, true);
    assert.equal(draft.json.label, "Draft – check before using");
    assert.match(draft.json.mode, /Demo AI \(sample answers\)/);
    assert.equal(draft.json.model, "");
    assert.equal(server.app.locals.db.prepare("SELECT status FROM reports WHERE id = ?").get(report.id).status, "NEW");
    const usage = await alex("GET", "/api/ai/usage");
    assert.equal(usage.json.demoAvailable, true);
    assert.equal(usage.json.spentCents, 0);
    assert.equal(usage.json.capCents, 500);
    const plumber = client(server.base);
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    assert.equal((await plumber("POST", "/api/ai/next-step", {})).status, 403);
  } finally {
    await server.close();
  }
});

test("a mocked model is billed, capped, and does not receive contact details", async () => {
  assert.equal(redactContacts("rita@example.com 0412000111"), "[email removed] [phone removed]");
  assert.ok(estimateAudCents(SONNET, 1_000_000, 0) > estimateAudCents(HAIKU, 1_000_000, 0));
  const seen = [];
  const server = await startApp({
    anthropicApiKey: "sk-ant-test-not-real",
    aiComplete: async (request) => {
      seen.push(request);
      return { text: "A short draft.", inputTokens: 1000, outputTokens: 200, demo: false };
    }
  });
  const alex = client(server.base);
  const guest = client(server.base);
  try {
    await signIn(alex, server, manager);
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const building = await alex("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    await alex("PATCH", "/api/buildings/" + building.json.building.id, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 });
    const place = await alex("POST", "/api/buildings/" + building.json.building.id + "/places", { name: "Lift 1" });
    const created = await guest("POST", "/api/public/reports", {
      token: place.json.place.token, description: "Door sticks. Write to rita@example.com",
      kind: "lift", name: "Rita", contact: "0412000111", consent: true,
      botA: 1, botB: 1, botAnswer: 2, idempotencyKey: "ai-report-2"
    });
    const report = server.app.locals.db.prepare("SELECT id FROM reports WHERE reference = ?").get(created.json.reference);
    const triage = await alex("POST", "/api/ai/triage", { reportId: report.id });
    assert.equal(triage.json.draft, true);
    assert.equal(triage.json.model, HAIKU);
    assert.equal(seen[0].user.includes("rita@example.com"), false);
    assert.equal(seen[0].user.includes("0412000111"), false);
    assert.equal(seen[0].user.includes("Rita"), false);
    const job = await alex("POST", "/api/jobs", { buildingId: building.json.building.id, title: "Lift door", area: "Ground", tradeId: "lift" });
    const compared = await alex("POST", "/api/ai/quote-compare", { jobId: job.json.job.id });
    assert.equal(compared.json.model, SONNET);
    assert.equal(server.app.locals.db.prepare("SELECT stage FROM jobs WHERE id = ?").get(job.json.job.id).stage, "open");
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(new Date());
    const user = server.app.locals.db.prepare("SELECT id FROM users WHERE email = 'alex@harbour.example'").get();
    server.app.locals.db.prepare("UPDATE ai_uses SET cost_cents = 500 WHERE user_id = ?").run(user.id);
    server.app.locals.db.prepare("UPDATE platform_settings SET ai_cap_cents = 500 WHERE id = 'main'").run();
    const blocked = await alex("POST", "/api/ai/next-step", {});
    assert.equal(blocked.status, 403);
    assert.match(blocked.json.error, /allowance/);
    assert.equal(seen.length, 2);
    assert.equal(month.length, 7);
  } finally {
    await server.close();
  }
});
