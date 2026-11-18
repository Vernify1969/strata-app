import test from "node:test";
import assert from "node:assert/strict";
import { cleanAssistantName, publicSearchQuery, webSearchCents } from "../src/chloe.js";
import { client, lastLink, startApp } from "./helpers.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("a rules answer cites a source, and a missing rule is not invented", async () => {
  const searches = [];
  const server = await startApp({
    anthropicApiKey: "sk-ant-test-not-real",
    aiChat: async () => ({ text: "A short draft.", inputTokens: 10, outputTokens: 5 }),
    webSearch: async ({ query }) => {
      searches.push(query);
      if (/essential safety|part 15/i.test(query)) {
        return {
          text: "Part 15 covers essential safety measure maintenance.",
          citations: [{ title: "Building Regulations 2018", url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/building-regulations-2018", section: "Part 15" }],
          searches: 1
        };
      }
      return { text: "", citations: [], searches: 1 };
    }
  });
  const mina = client(server.base);
  try {
    await signIn(mina, server, {
      kind: "manager", role: "building_manager", name: "Mina Costa", email: "mina@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await mina("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const building = await mina("POST", "/api/buildings", {
      name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
    });
    await mina("PATCH", "/api/buildings/" + building.json.building.id, { buildingUse: "residential", buildingClass: "2" });
    const rules = await mina("POST", "/api/ai/chat", {
      message: "What does Part 15 say about essential safety measures for unit 12 at 42 Collins Street? Email rita@example.com or call 0412000111.",
      buildingId: building.json.building.id
    });
    assert.equal(rules.status, 200);
    assert.equal(rules.json.draft, true);
    assert.equal(rules.json.label, "Draft – check before using");
    assert.equal(rules.json.webLabel, "From the web (checked today)");
    assert.ok(rules.json.citations.some(item => item.url.includes("legislation.vic.gov.au")));
    assert.match(rules.json.disclaimer, /not legal advice/);
    assert.equal(searches.some(query => /rita@example.com|0412000111|Collins Street|Harbour View|unit 12/i.test(query)), false);
    assert.equal(webSearchCents(1), 2);
    const use = server.app.locals.db.prepare("SELECT cost_cents FROM ai_uses WHERE helper = 'chloe'").get();
    assert.ok(use.cost_cents >= 2);
    const before = searches.length;
    const missing = await mina("POST", "/api/ai/chat", { message: "What fine does the Act set for a zzzx purple letterbox?" });
    assert.equal(missing.status, 200);
    assert.equal(/the fine is|\$\d/.test(missing.json.text), false);
    if (missing.json.citations.length === 0) assert.match(missing.json.text, /could not find/);
    else missing.json.citations.forEach(item => assert.match(item.url, /^https:\/\//));
    assert.ok(searches.length > before);
    const waiting = searches.length;
    await mina("POST", "/api/ai/chat", { message: "What is waiting on my jobs?" });
    assert.equal(searches.length, waiting);
  } finally {
    await server.close();
  }
});

test("the emergency switch stops web search, and each organisation keeps its own memory", async () => {
  const searches = [];
  const server = await startApp({
    owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" },
    webSearch: async ({ query }) => {
      searches.push(query);
      return { citations: [{ title: "VBA", url: "https://www.vba.vic.gov.au/", section: "Guidance" }], searches: 1, text: "See the VBA." };
    }
  });
  const alex = client(server.base);
  const helen = client(server.base);
  const owner = client(server.base);
  try {
    await signIn(alex, server, {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await signIn(helen, server, {
      kind: "manager", role: "oc_manager", name: "Helen Tran", email: "helen@riverside.example",
      mobile: "0418222333", password: "Riverside1", confirm: "Riverside1", agree: true
    });
    assert.equal(cleanAssistantName("Sam"), "Sam");
    assert.equal(cleanAssistantName("Sam 2"), "");
    assert.equal((await alex("PATCH", "/api/me/assistant", { name: "Sam", tone: "short" })).json.greeting, "Hi, I'm Sam, your AI assistant. How can I help you today?");
    assert.equal((await alex("PATCH", "/api/me/assistant", { name: "This name is far too long" })).status, 400);
    assert.equal((await alex("POST", "/api/notes", { text: "ZebraLamp handover is only for Harbour.", date: "2026-11-18" })).status, 201);
    const ownHistory = await alex("POST", "/api/ai/chat", { message: "What is the history of ZebraLamp?" });
    assert.match(ownHistory.json.text, /ZebraLamp/);
    const otherHistory = await helen("POST", "/api/ai/chat", { message: "What is the history of ZebraLamp?" });
    assert.equal(otherHistory.json.text.includes("ZebraLamp"), false);
    const remembered = await alex("POST", "/api/ai/chat", { message: "Please remember Harbour View lift contractor is Sam" });
    assert.equal(remembered.status, 200);
    const mine = await alex("GET", "/api/ai/memory");
    assert.equal(mine.json.memory.length, 1);
    const hers = await helen("GET", "/api/ai/memory");
    assert.equal(hers.json.memory.length, 0);
    assert.equal((await helen("DELETE", "/api/ai/memory/" + mine.json.memory[0].id)).status, 404);
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const added = await owner("POST", "/api/owner/sources", {
      title: "EPA Victoria",
      url: "https://www.epa.vic.gov.au/for-business",
      section: "EPA Victoria public guidance",
      excerpt: "EPA Victoria publishes public guidance for business and industrial sites. This note points to that site.",
      classes: ["8"],
      topics: ["epa", "industrial"]
    });
    assert.equal(added.status, 201);
    const stopped = await owner("POST", "/api/owner/web-search", { enabled: false, confirm: true, reason: "Cost spike" });
    assert.equal(stopped.json.webSearchEnabled, false);
    const calls = searches.length;
    await alex("POST", "/api/ai/chat", { message: "What does the Building Act say about a permit?" });
    assert.equal(searches.length, calls);
    assert.equal((await helen("POST", "/api/owner/web-search", { enabled: true, confirm: true, reason: "No" })).status, 403);
  } finally {
    await server.close();
  }
});
