import test from "node:test";
import assert from "node:assert/strict";
import { helpersForRole } from "../src/ai.js";
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

test("each role only reaches its own helpers", async () => {
  assert.equal(helpersForRole("property_manager").some(item => item.id === "triage"), false);
  assert.equal(helpersForRole("property_manager").some(item => item.id === "budget-warning"), false);
  assert.equal(helpersForRole("building_manager").some(item => item.id === "triage"), true);
  const seen = [];
  const server = await startApp({
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" },
    aiComplete: async (request) => {
      seen.push(request.user);
      return { text: "A short draft.", inputTokens: 0, outputTokens: 0, demo: true };
    }
  });
  const building = client(server.base);
  const property = client(server.base);
  const plumber = client(server.base);
  const other = client(server.base);
  const owner = client(server.base);
  try {
    await signIn(building, server, manager);
    await signIn(property, server, {
      kind: "manager", role: "property_manager", name: "Leo Park", email: "leo@lets.example",
      mobile: "0418333444", password: "Lettings1", confirm: "Lettings1", agree: true
    });
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await signIn(other, server, {
      kind: "contractor", name: "Ada Bolts", businessName: "Ada Electrical", email: "ada@electrical.example",
      mobile: "0400333444", password: "Sparks12", confirm: "Sparks12", agree: true
    });
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);

    assert.equal((await property("POST", "/api/ai/triage", {})).status, 403);
    assert.equal((await property("POST", "/api/ai/budget-warning", {})).status, 403);
    const propertyUse = await property("GET", "/api/ai/usage");
    assert.equal(propertyUse.json.helpers.some(item => item.id === "next-step"), true);
    assert.equal(propertyUse.json.capCents, 500);
    assert.match((await property("POST", "/api/ai/next-step", {})).json.mode, /Demo AI \(sample answers\)/);

    assert.equal((await plumber("POST", "/api/ai/triage", {})).status, 403);
    assert.equal((await building("POST", "/api/ai/contractor-quote", {})).status, 403);
    const waiting = await plumber("POST", "/api/ai/contractor-waiting", {});
    assert.equal(waiting.status, 200);
    assert.equal(waiting.json.label, "Draft – check before using");
    assert.equal(waiting.json.draft, true);
    const contractorUse = await plumber("GET", "/api/ai/usage");
    assert.equal(contractorUse.json.capCents, 200);
    assert.equal(contractorUse.json.helpers.length, 4);

    await building("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const place = await building("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    const job = await building("POST", "/api/jobs", {
      buildingId: place.json.building.id, title: "Leaking tap. Call 0412000111", area: "Kitchen", tradeId: "plumbing", instructions: "Replace the washer. Email rita@example.com"
    });
    const before = server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM quotes").get().n;
    const quote = await plumber("POST", "/api/ai/contractor-quote", { jobId: job.json.job.id });
    assert.equal(quote.status, 200);
    assert.equal(seen.some(text => text.includes("0412000111") || text.includes("rita@example.com")), false);
    assert.equal(server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM quotes").get().n, before);
    assert.equal(server.app.locals.db.prepare("SELECT stage FROM jobs WHERE id = ?").get(job.json.job.id).stage, "open");

    const doc = await plumber("POST", "/api/documents", {
      kind: "insurance", mime: "application/pdf", filename: "policy.pdf",
      dataBase64: Buffer.from("%PDF-1.4\n(Insurance policy POL-1 Expiry: 2027-06-01)\n%%EOF").toString("base64"),
      declaration: true, expiry: "2027-06-01"
    });
    assert.equal((await other("POST", "/api/ai/contractor-paperwork", { documentId: doc.json.document.id })).status, 404);
    assert.equal((await plumber("POST", "/api/ai/contractor-paperwork", { documentId: doc.json.document.id })).status, 200);

    const ownerDraft = await owner("POST", "/api/ai/owner-attention", {});
    assert.equal(ownerDraft.status, 200);
    assert.equal((await owner("POST", "/api/ai/triage", {})).status, 403);
    const ownerUse = await owner("GET", "/api/ai/usage");
    assert.equal(ownerUse.json.uncapped, true);
    assert.equal(ownerUse.json.capCents, null);

    const office = await owner("GET", "/api/owner/ai");
    assert.equal(office.json.contractorCapCents, 200);
    assert.ok(office.json.contractors.some(row => row.email === "sam@plumbing.example"));
  } finally {
    await server.close();
  }
});

test("a contractor allowance stops at A$2 and the owner stays uncapped", async () => {
  const server = await startApp({
    anthropicApiKey: "sk-ant-test-not-real",
    aiComplete: async () => ({ text: "A short draft.", inputTokens: 100, outputTokens: 20, demo: false }),
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" }
  });
  const plumber = client(server.base);
  const owner = client(server.base);
  try {
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const first = await plumber("POST", "/api/ai/contractor-waiting", {});
    assert.equal(first.status, 200);
    const user = server.app.locals.db.prepare("SELECT id FROM users WHERE email = 'sam@plumbing.example'").get();
    server.app.locals.db.prepare("UPDATE ai_uses SET cost_cents = 200 WHERE user_id = ?").run(user.id);
    assert.equal((await plumber("POST", "/api/ai/contractor-reply", {})).status, 403);
    const ownerId = server.app.locals.db.prepare("SELECT id FROM users WHERE email = 'owner@taskspeck.example'").get().id;
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(new Date());
    server.app.locals.db.prepare(`INSERT INTO ai_uses (id, user_id, helper, model, demo, month, input_tokens, output_tokens, cost_cents, subject_type, subject_id, created_at)
      VALUES ('owner-spent', ?, 'owner-attention', 'claude-haiku-5-5', 0, ?, 10, 10, 500000, '', '', ?)`).run(ownerId, month, new Date().toISOString());
    assert.equal((await owner("POST", "/api/ai/owner-reply", { about: "Thanks for writing. Email owner@secret.example" })).status, 200);
  } finally {
    await server.close();
  }
});
