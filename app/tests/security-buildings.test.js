import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "../src/passwords.js";
import { newId } from "../src/ids.js";
import { client, lastLink, startApp } from "./helpers.js";

function manager(extra = {}) {
  return {
    kind: "manager",
    role: "building_manager",
    name: "Alex Nguyen",
    email: "alex@harbour.example",
    mobile: "0418220184",
    password: "Harbour1",
    confirm: "Harbour1",
    agree: true,
    ...extra
  };
}

async function signIn(api, server, details) {
  const created = await api("POST", "/api/register", details);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  const signed = await api("POST", "/api/login", { email: details.email, password: details.password });
  assert.equal(signed.status, 200);
  return signed.json.user;
}

const harbour = {
  name: "Harbour View Apartments",
  streetNumber: "42",
  street: "Collins Street",
  suburb: "Melbourne",
  postcode: "3000",
  ocPlan: "OC Plan 41288"
};

test("a manager cannot read or change another organisation's building", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const sam = client(server.base);
  try {
    await signIn(alex, server, manager());
    await signIn(sam, server, manager({ email: "sam@other.example", name: "Sam Okonkwo" }));
    const created = await alex("POST", "/api/buildings", harbour);
    assert.equal(created.status, 201);
    assert.equal(created.json.building.world, "common");
    assert.equal(created.json.building.tier1, 999);
    assert.equal(created.json.building.q1, 1);
    assert.equal(created.json.building.tier2, 4999);
    assert.equal(created.json.building.q3, 3);
    const stolen = await sam("GET", "/api/buildings/" + created.json.building.id);
    assert.equal(stolen.status, 404);
    const changed = await sam("PATCH", "/api/buildings/" + created.json.building.id, { name: "Taken over" });
    assert.equal(changed.status, 404);
    const listed = await sam("GET", "/api/buildings");
    assert.equal(listed.json.buildings.length, 0);
    const still = await alex("GET", "/api/buildings/" + created.json.building.id);
    assert.equal(still.json.building.name, "Harbour View Apartments");
    const moved = await alex("PATCH", "/api/buildings/" + created.json.building.id, { organisationId: "someone-else", world: "private" });
    assert.equal(moved.status, 400);
  } finally {
    await server.close();
  }
});

test("a colleague in the same organisation cannot see a building that is not assigned to them", async () => {
  const server = await startApp();
  const alex = client(server.base);
  try {
    const user = await signIn(alex, server, manager());
    const created = await alex("POST", "/api/buildings", harbour);
    const colleagueId = newId();
    const now = new Date().toISOString();
    server.app.locals.db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, email_verified_at, created_at)
      VALUES (?, ?, 'mina@harbour.example', ?, 'oc_manager', 'Mina Costa', '0400000000', 'Harbour', ?, ?)`).run(
      colleagueId, user.organisationId, await hashPassword("Harbour1"), now, now
    );
    const mina = client(server.base);
    const signed = await mina("POST", "/api/login", { email: "mina@harbour.example", password: "Harbour1" });
    assert.equal(signed.status, 200);
    const hidden = await mina("GET", "/api/buildings/" + created.json.building.id);
    assert.equal(hidden.status, 404);
    const list = await mina("GET", "/api/buildings");
    assert.equal(list.json.buildings.length, 0);
  } finally {
    await server.close();
  }
});

test("coverage, worlds and budget rules are enforced on the server", async () => {
  const server = await startApp();
  const api = client(server.base);
  const property = client(server.base);
  const contractor = client(server.base);
  try {
    await signIn(api, server, manager());
    const outside = await api("POST", "/api/buildings", { ...harbour, postcode: "3128", suburb: "Box Hill" });
    assert.equal(outside.status, 202);
    assert.equal(outside.json.waiting, true);
    const list = await api("GET", "/api/buildings");
    assert.equal(list.json.buildings.length, 0);
    assert.equal(list.json.waiting.length, 1);
    const missingPlan = await api("POST", "/api/buildings", { ...harbour, ocPlan: "" });
    assert.equal(missingPlan.status, 400);
    const saved = await api("POST", "/api/buildings", harbour);
    const badQuotes = await api("PATCH", "/api/buildings/" + saved.json.building.id, { q1: 2, q2: 1, q3: 3 });
    assert.equal(badQuotes.status, 400);
    assert.match(badQuotes.json.error, /fewer quotes/);
    const kept = await api("PATCH", "/api/buildings/" + saved.json.building.id, { tier1: 1000, tier2: 5000, tier3: 20000, q1: 1, q2: 2, q3: 3, keepTiers: true });
    assert.equal(kept.status, 200);
    assert.equal(kept.json.building.tiersConfirmed, true);
    assert.equal(kept.json.building.tier1, 1000);

    await signIn(property, server, manager({ role: "property_manager", email: "pat@rentals.example", name: "Pat Ellis" }));
    const shop = await property("POST", "/api/buildings", {
      name: "Chapel Shop",
      streetNumber: "12",
      street: "Chapel Street",
      suburb: "Prahran",
      postcode: "3181"
    });
    assert.equal(shop.status, 201);
    assert.equal(shop.json.building.world, "private");
    const commonLeak = await property("GET", "/api/buildings/" + saved.json.building.id);
    assert.equal(commonLeak.status, 404);

    await signIn(contractor, server, {
      kind: "contractor",
      name: "Sam Okonkwo",
      businessName: "Sam Plumbing",
      email: "sam@plumbing.example",
      mobile: "0400111222",
      password: "Pipes123",
      confirm: "Pipes123",
      agree: true
    });
    const refused = await contractor("POST", "/api/buildings", harbour);
    assert.equal(refused.status, 403);
    const area = await contractor("GET", "/api/area");
    assert.equal(area.status, 200);
    assert.equal(area.json.postcodes.includes("3000"), true);
    assert.equal(area.json.postcodes.includes("3128"), false);
    const ownerOnly = await api("PUT", "/api/owner/postcodes", { postcodes: ["3000"] });
    assert.equal(ownerOnly.status, 403);
  } finally {
    await server.close();
  }
});
