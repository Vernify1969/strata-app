import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { client, lastLink, startApp } from "./helpers.js";
import { remindOpenReviews } from "../src/maintenance.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

test("arrival, evidence and a safety stop are saved, and the review reminder goes out once", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const plumber = client(server.base);
  try {
    await signIn(alex, server, {
      kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
      mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true
    });
    await alex("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
    const created = await alex("POST", "/api/buildings", {
      name: "Harbour View Apartments", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 41288"
    });
    const building = created.json.building;
    await alex("PATCH", "/api/buildings/" + building.id, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3, captureM: 150 });
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });

    async function book(title) {
      const posted = await alex("POST", "/api/jobs", { buildingId: building.id, title, area: "Lobby", tradeId: "plumbing", deadline: "2026-12-20" });
      const quote = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/quotes", {
        price: 180, scope: ["Replace the washer", "Test for leaks"], date: "2026-12-02", time: "09:00", depositType: "none"
      });
      assert.equal((await alex("POST", "/api/jobs/" + posted.json.job.id + "/approve", { quoteId: quote.json.quoteId })).status, 200);
      return posted.json.job.id;
    }

    const id = await book("Lobby tap");
    assert.equal((await plumber("POST", "/api/jobs/" + id + "/arrival", { status: "arrived" })).status, 400);
    assert.equal((await plumber("POST", "/api/jobs/" + id + "/arrival", { status: "arrived", lat: building.lat + 0.02, lng: building.lng, far: false })).status, 400);
    const arrived = await plumber("POST", "/api/jobs/" + id + "/arrival", { status: "arrived", lat: building.lat, lng: building.lng });
    assert.equal(arrived.status, 200);
    assert.ok(arrived.json.distanceM <= 150);
    assert.equal((await alex("GET", "/api/jobs/" + id)).json.job.arrival, "arrived");
    assert.equal((await plumber("POST", "/api/jobs/" + id + "/start", {})).status, 400);
    assert.equal((await plumber("POST", "/api/jobs/" + id + "/safety", { answers: ["yes", "yes", "yes", "yes", "yes"] })).status, 200);
    assert.equal((await plumber("POST", "/api/jobs/" + id + "/start", {})).json.stage, "onsite");

    assert.equal((await plumber("POST", "/api/jobs/" + id + "/evidence", { stage: "before", kind: "photo", lat: building.lat, lng: building.lng, far: true })).status, 400);
    for (let n = 0; n < 3; n += 1) {
      assert.equal((await plumber("POST", "/api/jobs/" + id + "/evidence", { stage: "before", kind: "photo", lat: building.lat, lng: building.lng })).status, 201);
      assert.equal((await plumber("POST", "/api/jobs/" + id + "/evidence", { stage: "after", kind: "photo", lat: building.lat, lng: building.lng })).status, 201);
    }
    const video = await plumber("POST", "/api/jobs/" + id + "/evidence", { stage: "after", kind: "video", lat: building.lat, lng: building.lng });
    assert.equal(video.status, 201);
    const file = await plumber("GET", "/api/jobs/" + id + "/evidence/" + video.json.id);
    assert.equal(file.status, 200);
    const submitted = await plumber("POST", "/api/jobs/" + id + "/submit-work", {});
    assert.equal(submitted.json.stage, "review0");
    const challenged = await alex("POST", "/api/jobs/" + id + "/challenge", { items: ["Replace the washer"], note: "It still drips" });
    assert.equal(challenged.json.stage, "fix1");
    assert.equal((await alex("GET", "/api/jobs/" + id)).json.job.challenges[0].note, "It still drips");

    const stopped = await book("Unsafe stair");
    const unsafe = await plumber("POST", "/api/jobs/" + stopped + "/unsafe", {});
    assert.equal(unsafe.json.strike, false);
    assert.equal(unsafe.json.stage, "paid");

    const db = new DatabaseSync(server.config.databasePath, { readOnly: true });
    assert.ok(db.prepare("PRAGMA user_version").get().user_version >= 22);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contractor_strikes").get().n, 0);
    db.close();
    const openDb = server.app.locals.db;
    openDb.prepare("UPDATE jobs SET stage = 'review0', review_ends_at = ?, review_reminded_at = '' WHERE id = ?").run(new Date(Date.now() + 20 * 3600 * 1000).toISOString(), id);
    assert.equal(await remindOpenReviews(openDb, server.app.locals.mail, new Date()), 1);
    assert.equal(await remindOpenReviews(openDb, server.app.locals.mail, new Date()), 0);
    const mail = server.app.locals.mail.readAll();
    assert.ok(mail.some(item => item.to === "alex@harbour.example" && item.subject === "24 hours left to review the work"));
    const record = await alex("GET", "/api/jobs/" + id + "/evidence.txt");
    assert.match(record.text, /Lobby tap/);
    const page = await (await fetch(server.base + "/")).text();
    assert.match(page, /capture="environment"/);
    assert.match(page, /Stop: this job is unsafe/);
  } finally {
    await server.close();
  }
});
