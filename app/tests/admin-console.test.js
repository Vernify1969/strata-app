import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_OWNER } from "../src/demo-seed.js";
import { client, lastLink, startApp } from "./helpers.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

const paths = [
  ["GET", "/api/admin/dashboard"],
  ["GET", "/api/admin/search?q=mina"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/admin/users/x"],
  ["GET", "/api/admin/users.csv"],
  ["GET", "/api/admin/organisations"],
  ["GET", "/api/admin/organisations/x"],
  ["GET", "/api/admin/buildings"],
  ["GET", "/api/admin/buildings/x"],
  ["GET", "/api/admin/jobs"],
  ["GET", "/api/admin/jobs/x"],
  ["GET", "/api/admin/jobs.csv"],
  ["GET", "/api/admin/payments"],
  ["GET", "/api/admin/payments/x"],
  ["GET", "/api/admin/payments.csv"],
  ["GET", "/api/admin/mail"],
  ["GET", "/api/admin/messages"],
  ["GET", "/api/admin/drafts"],
  ["GET", "/api/admin/reports"],
  ["GET", "/api/admin/documents"],
  ["GET", "/api/admin/ai"],
  ["GET", "/api/admin/settings"],
  ["GET", "/api/admin/postcodes"],
  ["GET", "/api/admin/audit"],
  ["GET", "/api/admin/audit.csv"],
  ["PATCH", "/api/admin/users/x"],
  ["POST", "/api/admin/users/x/suspend"],
  ["POST", "/api/admin/users/x/strikes"],
  ["POST", "/api/admin/users/x/notes"],
  ["POST", "/api/admin/users/x/send-reset"],
  ["POST", "/api/admin/users/x/view-as"],
  ["POST", "/api/admin/view-as/stop"],
  ["PATCH", "/api/admin/buildings/x"],
  ["POST", "/api/admin/buildings/x/managers"],
  ["POST", "/api/admin/places/x/active"],
  ["POST", "/api/admin/jobs/x/status"],
  ["POST", "/api/admin/jobs/x/reassign"],
  ["POST", "/api/admin/jobs/x/cancel"],
  ["POST", "/api/admin/payments/x/pause"],
  ["POST", "/api/admin/mail/x/resend"],
  ["POST", "/api/admin/drafts"],
  ["POST", "/api/admin/drafts/x/send"],
  ["POST", "/api/admin/documents/x/review"],
      ["PATCH", "/api/admin/settings"],
      ["POST", "/api/admin/web-search"],
  ["PATCH", "/api/admin/templates/verify"],
  ["POST", "/api/admin/postcodes"]
];

test("other roles are refused on every admin endpoint, and edits are audited without passwords", async () => {
  const server = await startApp({ owner: { email: "owner@taskspeck.example", password: "Ownerpass1", name: "Nick Owner" } });
  const manager = client(server.base);
  const owner = client(server.base);
  try {
    await signIn(manager, server, {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    for (const [method, path] of paths) {
      const result = method === "GET" ? await manager(method, path) : await manager(method, path, { confirm: true, reason: "No" });
      assert.equal(result.status, 403, path);
      assert.equal(JSON.stringify(result.json || {}).includes("password_hash"), false);
    }
    assert.equal((await owner("POST", "/api/login", { email: "owner@taskspeck.example", password: "Ownerpass1" })).status, 200);
    const page = await owner("GET", "/admin");
    assert.equal(page.status, 200);
    assert.match(page.text, /Admin console/);
    const users = await owner("GET", "/api/admin/users");
    assert.equal(JSON.stringify(users.json).includes("password_hash"), false);
    const person = users.json.rows.find(row => row.email === "alex@harbour.example");
    const refused = await owner("PATCH", "/api/admin/users/" + person.id, { name: "Alex N" });
    assert.equal(refused.status, 400);
    const edited = await owner("PATCH", "/api/admin/users/" + person.id, { name: "Alex N", confirm: true, reason: "Fix the name" });
    assert.equal(edited.status, 200);
    assert.equal(edited.json.user.name, "Alex N");
    assert.equal(JSON.stringify(edited.json).includes("password"), false);
    const log = await owner("GET", "/api/admin/audit?q=user_edited");
    const event = log.json.rows.find(row => row.action === "admin.user_edited");
    assert.ok(event);
    assert.match(event.detail, /Alex Nguyen/);
    assert.match(event.detail, /Alex N/);
    const settings = await owner("GET", "/api/admin/settings");
    assert.equal(settings.json.assistantName, "Chloe");
    assert.equal(settings.json.webSearchEnabled, true);
    const paused = await owner("POST", "/api/admin/web-search", { enabled: false, confirm: true, reason: "Cost spike" });
    assert.equal(paused.json.emergency, true);
    assert.equal((await owner("GET", "/api/admin/settings")).json.assistantName, "Chloe");
    const mail = await owner("GET", "/api/admin/mail?q=Confirm");
    assert.ok(mail.json.rows.some(row => row.to_email === "alex@harbour.example"));
    const viewed = await owner("POST", "/api/admin/users/" + person.id + "/view-as", { confirm: true, reason: "Check the account" });
    assert.equal(viewed.status, 200);
    const me = await owner("GET", "/api/me");
    assert.equal(me.json.user.viewingAs, true);
    assert.match(me.json.banner, /cannot change anything/);
    assert.equal((await owner("PATCH", "/api/me/preferences", { calYear: 2026, calMonth: 0, noteYear: 2026, noteMonth: 0 })).status, 403);
  } finally {
    await server.close();
  }
});

test("the demo admin console has a row in each main section", async () => {
  const server = await startApp({ demoMode: true });
  const owner = client(server.base);
  try {
    assert.equal((await owner("POST", "/api/login", { email: DEMO_OWNER.email, password: DEMO_OWNER.password })).status, 200);
    const dash = await owner("GET", "/api/admin/dashboard");
    assert.ok(dash.json.openJobs > 0);
    assert.ok(dash.json.openReports > 0);
    assert.ok(dash.json.moneyHeldCents > 0);
    assert.ok((await owner("GET", "/api/admin/mail")).json.total > 0);
    assert.ok((await owner("GET", "/api/admin/documents")).json.rows.length > 0);
    assert.ok((await owner("GET", "/api/admin/reports")).json.total > 0);
    assert.ok((await owner("GET", "/api/admin/messages")).json.total > 0);
    assert.ok((await owner("GET", "/api/admin/drafts")).json.rows.length > 0);
    const settings = await owner("GET", "/api/admin/settings");
    assert.ok(settings.json.templates.length >= 4);
    assert.equal(JSON.stringify(settings.json).includes("password_hash"), false);
  } finally {
    await server.close();
  }
});
