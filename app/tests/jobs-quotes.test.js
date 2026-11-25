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

const manager = extra => ({
  kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
  mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true, ...extra
});

async function readyManager(api, server, details) {
  await signIn(api, server, details);
  await api("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
  const building = await api("POST", "/api/buildings", {
    name: "Harbour View Apartments", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 41288"
  });
  const budgets = await api("PATCH", "/api/buildings/" + building.json.building.id, { tier1: 999, tier2: 4999, tier3: 30000, q1: 1, q2: 2, q3: 3 });
  return budgets.json.building;
}

const offer = { price: 180, scope: ["Replace the washer"], date: "2026-12-02", time: "09:00", depositType: "none" };

test("a manager can edit, search, decline and extend, and a contractor can withdraw", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const plumber = client(server.base);
  try {
    const building = await readyManager(alex, server, manager());
    const posted = await alex("POST", "/api/jobs", {
      buildingId: building.id, title: "Dripping kitchen tap", area: "Level 6 kitchen", tradeId: "plumbing", deadline: "2020-01-01"
    });
    const id = posted.json.job.id;
    const edited = await alex("PATCH", "/api/jobs/" + id, { title: "Kitchen mixer tap", area: "Level 6 kitchen" });
    assert.equal(edited.status, 200);
    assert.equal(edited.json.job.title, "Kitchen mixer tap");
    const found = await alex("GET", "/api/jobs?q=mixer");
    assert.equal(found.json.jobs.length, 1);
    assert.equal((await alex("GET", "/api/jobs?q=roof")).json.jobs.length, 0);

    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    assert.equal((await plumber("POST", "/api/jobs/" + id + "/quotes", offer)).status, 400);
    const extended = await alex("POST", "/api/jobs/" + id + "/extend-deadline", {});
    assert.equal(extended.status, 200);
    assert.match(extended.json.quoteDeadline, /^\d{4}-\d{2}-\d{2}$/);
    const quote = await plumber("POST", "/api/jobs/" + id + "/quotes", offer);
    assert.equal(quote.status, 201);
    assert.equal((await alex("PATCH", "/api/jobs/" + id, { title: "Too late" })).status, 400);

    const declined = await alex("POST", "/api/jobs/" + id + "/quotes/" + quote.json.quoteId + "/decline", { reason: "Price too high" });
    assert.equal(declined.status, 200);
    assert.equal((await alex("POST", "/api/jobs/" + id + "/approve", { quoteId: quote.json.quoteId })).status, 404);
    assert.equal((await alex("POST", "/api/jobs/" + id + "/quotes/" + quote.json.quoteId + "/undo-decline", {})).status, 200);
    const withdrawn = await plumber("POST", "/api/jobs/" + id + "/quotes/" + quote.json.quoteId + "/withdraw", {});
    assert.equal(withdrawn.status, 200);
    const again = await alex("PATCH", "/api/jobs/" + id, { title: "Kitchen mixer tap" });
    assert.equal(again.status, 200);
    const page = await (await fetch(server.base + "/")).text();
    assert.match(page, /Search your jobs/);
    assert.match(page, /Edit this request/);
    assert.match(page, /Decline this quote/);
    assert.match(page, /Withdraw my offer/);
    assert.match(page, /Extend by 2 days/);
  } finally {
    await server.close();
  }
});

test("cancelling before arrival records a strike, unless the reason excuses it or the manager cancels", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const plumber = client(server.base);
  try {
    const building = await readyManager(alex, server, manager());
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });

    async function book(title) {
      const posted = await alex("POST", "/api/jobs", { buildingId: building.id, title, area: "Lobby", tradeId: "plumbing", deadline: "2026-12-20" });
      const quote = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/quotes", offer);
      assert.equal((await alex("POST", "/api/jobs/" + posted.json.job.id + "/approve", { quoteId: quote.json.quoteId })).status, 200);
      return posted.json.job.id;
    }

    const unsafe = await book("Unsafe site");
    const excused = await plumber("POST", "/api/jobs/" + unsafe + "/cancel", { reason: "The site was unsafe" });
    assert.equal(excused.status, 200);
    assert.equal(excused.json.strike, false);
    assert.equal(excused.json.stage, "open");

    const sick = await book("Sick day");
    const struck = await plumber("POST", "/api/jobs/" + sick + "/cancel", { reason: "I was sick or had an emergency" });
    assert.equal(struck.status, 200);
    assert.equal(struck.json.strike, true);
    assert.equal(struck.json.strikeCount, 1);

    const managerJob = await book("Manager changed their mind");
    const byManager = await alex("POST", "/api/jobs/" + managerJob + "/cancel", { reason: "We no longer need this work" });
    assert.equal(byManager.status, 200);
    assert.equal(byManager.json.strike, false);

    const db = new DatabaseSync(server.config.databasePath, { readOnly: true });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 21);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contractor_strikes WHERE kind = 'cancel'").get().n, 1);
    db.close();
  } finally {
    await server.close();
  }
});
