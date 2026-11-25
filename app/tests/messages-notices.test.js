import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { client } from "./helpers.js";
import { startApp } from "./helpers.js";
import { planNotice } from "../src/notify.js";

function outbox(server) {
  const text = fs.readFileSync(server.config.outboxPath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map(line => JSON.parse(line));
}

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const link = outbox(server).at(-1).text.match(/https?:\/\/\S+/)[0];
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("job messages, help and notification settings stay with the person", async () => {
  const server = await startApp({ supportEmail: "help@example.com" });
  const alex = client(server.base);
  const plumber = client(server.base);
  try {
    const help = await alex("GET", "/api/help");
    assert.equal(help.json.supportEmail, "help@example.com");
    assert.match(help.json.emergency, /call 000/);
    assert.equal(help.json.questions.length, 7);
    assert.match(help.json.supportNote, /placeholder/);
    const vapid = await alex("GET", "/api/push/vapid");
    assert.equal(vapid.json.configured, false);
    assert.equal(vapid.json.publicKey, "");

    await signIn(alex, server, {
      kind: "manager", role: "oc_manager", name: "Helen Tran", email: "helen@riverside.example",
      mobile: "0418220184", password: "Riverside1", confirm: "Riverside1", agree: true
    });
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Riverside OC" });
    const created = await alex("POST", "/api/buildings", {
      name: "Riverside Gardens", streetNumber: "8", street: "River Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 88001"
    });
    const buildingId = created.json.building.id;
    await alex("PATCH", "/api/buildings/" + buildingId, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 });
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const posted = await alex("POST", "/api/jobs", { buildingId, title: "Lobby tap", area: "Lobby", tradeId: "plumbing" });
    const jobId = posted.json.job.id;
    assert.equal((await plumber("POST", "/api/jobs/" + jobId + "/quotes", {
      price: 180, scope: ["Replace the washer"], date: "2026-12-02", time: "09:00", depositType: "none"
    })).status, 201);
    const contractorId = server.app.locals.db.prepare("SELECT contractor_user_id FROM quotes WHERE job_id = ?").get(jobId).contractor_user_id;
    assert.equal((await alex("POST", "/api/jobs/" + jobId + "/messages", { contractorId, text: "Email me at helen@riverside.example" })).status, 400);

    const sent = await alex("POST", "/api/jobs/" + jobId + "/messages", { contractorId, text: "Is the tap in the lobby or the hall?" });
    assert.equal(sent.status, 201);
    const job = await plumber("GET", "/api/jobs/" + jobId);
    assert.equal(job.json.job.messages.length, 1);
    assert.match(job.json.job.messages[0].text, /lobby or the hall/);
    const notes = await plumber("GET", "/api/notifications");
    assert.equal(notes.json.notifications.length, 1);
    assert.equal(outbox(server).filter(message => message.subject === "New message on Lobby tap").length, 1);
    const managerView = await alex("GET", "/api/jobs/" + jobId);
    assert.equal(managerView.json.job.messages[0].author, "Helen Tran");

    const quiet = await plumber("PATCH", "/api/me/notifications", { events: { msg: false } });
    assert.equal(quiet.status, 200);
    assert.equal(quiet.json.events.msg, false);
    assert.equal(quiet.json.events.job, true);
    assert.equal(quiet.json.urgentAlwaysEmail, true);
    assert.equal(quiet.json.smsSends, false);
    assert.equal((await plumber("PATCH", "/api/me/notifications", { events: { urgent: false } })).status, 400);
    assert.equal((await plumber("PATCH", "/api/me/notifications", { events: { quote: false } })).status, 400);
    await alex("POST", "/api/jobs/" + jobId + "/messages", { contractorId, text: "One more question about the washer." });
    assert.equal((await plumber("GET", "/api/notifications")).json.notifications.length, 1);
    assert.equal(outbox(server).filter(message => message.subject === "New message on Lobby tap").length, 1);

    assert.equal((await plumber("PATCH", "/api/me/notifications", { channels: { email: false }, events: { msg: true } })).status, 200);
    await alex("POST", "/api/jobs/" + jobId + "/messages", { contractorId, text: "The washer is in the lobby." });
    assert.equal((await plumber("GET", "/api/notifications")).json.notifications.length, 2);
    assert.equal(outbox(server).filter(message => message.subject === "New message on Lobby tap").length, 1);

    const helen = await alex("GET", "/api/me/notifications");
    assert.equal(helen.json.events.quote, true);
    assert.equal(helen.json.events.job, undefined);
    assert.equal((await alex("PATCH", "/api/me/notifications", { channels: { sms: true } })).json.channels.sms, true);
    assert.equal((await plumber("GET", "/api/me/notifications")).json.channels.sms, false);

    const urgent = planNotice({ channels: { email: false, sms: true, push: false }, events: {} }, "pay", true);
    assert.equal(urgent.email, true);
    assert.equal(urgent.sms, false);
    const off = planNotice({ channels: { email: true, sms: true, push: true }, events: { msg: false } }, "msg", false);
    assert.equal(off.email, false);
    assert.equal(off.sms, false);
    assert.equal(off.inApp, false);

    const push = await plumber("POST", "/api/me/push", { demo: true });
    assert.equal(push.status, 201);
    assert.equal(push.json.stored, true);
    assert.equal(push.json.delivered, false);
    assert.match(push.json.message, /when push keys are configured/);
    assert.equal(server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE demo = 1").get().n, 1);
    assert.equal((await plumber("DELETE", "/api/me/push")).json.removed, true);
    assert.equal(server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n, 0);

    const version = new DatabaseSync(server.config.databasePath, { readOnly: true });
    assert.ok(version.prepare("PRAGMA user_version").get().user_version >= 25);
    version.close();
    const page = await (await fetch(server.base + "/")).text();
    const worker = await (await fetch(server.base + "/sw.js")).text();
    assert.match(page, /In an emergency call 000/);
    assert.match(page, /support@your-domain\.example/);
    assert.match(page, /placeholder until the real support address exists/);
    assert.match(page, /Help and support/);
    assert.match(page, /Notification settings/);
    assert.match(page, /A quote arrives/);
    assert.match(page, /A new job near me/);
    assert.match(page, /always by email/);
    assert.match(page, /Send message/);
    for (const question of ["How do I send a request?", "What does it cost?", "What if the work is not right?", "Can I change a request?", "What if no one quotes?", "How do I stop being notified?", "How do I get or delete my data?"]) {
      assert.match(page, new RegExp(question.replace(/[?]/g, "\\?")));
    }
    assert.match(page, /<details/);
    assert.match(worker, /showNotification/);
    assert.match(page, /server\.arcgisonline\.com/);
    assert.doesNotMatch(page, /tile\.openstreetmap\.org/);
  } finally {
    await server.close();
  }
});
