import test from "node:test";
import assert from "node:assert/strict";
import { client, lastLink, startApp } from "./helpers.js";

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  const signed = await api("POST", "/api/login", { email: details.email, password: details.password });
  assert.equal(signed.status, 200);
  return signed.json.user;
}

const manager = extra => ({
  kind: "manager", role: "building_manager", name: "Alex Nguyen", email: "alex@harbour.example",
  mobile: "0418220184", password: "Harbour1", confirm: "Harbour1", agree: true, ...extra
});

async function readyManager(api, server, details) {
  const user = await signIn(api, server, details);
  await api("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
  const building = await api("POST", "/api/buildings", {
    name: "Harbour View Apartments", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 41288"
  });
  assert.equal(building.status, 201);
  return { user, building: building.json.building };
}

test("another organisation cannot read a job, and a contractor does not see the street number before booking", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const sam = client(server.base);
  const plumber = client(server.base);
  try {
    const { building } = await readyManager(alex, server, manager());
    await readyManager(sam, server, manager({ email: "sam@other.example", name: "Sam Okonkwo" }));
    const posted = await alex("POST", "/api/jobs", { buildingId: building.id, title: "Dripping kitchen tap", area: "Level 6 kitchen", tradeId: "plumbing", instructions: "The mixer drips." });
    assert.equal(posted.status, 201);
    const hidden = await sam("GET", "/api/jobs/" + posted.json.job.id);
    assert.equal(hidden.status, 404);
    const list = await sam("GET", "/api/jobs");
    assert.equal(list.json.jobs.some(job => job.id === posted.json.job.id), false);

    await signIn(plumber, server, {
      kind: "contractor", name: "Priya Shah", businessName: "Priya Electrical", email: "priya@wire.example",
      mobile: "0400111222", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const seen = await plumber("GET", "/api/jobs/" + posted.json.job.id);
    assert.equal(seen.status, 200);
    const text = JSON.stringify(seen.json);
    assert.equal(text.includes("42"), false);
    assert.equal(text.includes("Collins Street"), true);
    assert.equal(seen.json.job.access, "");
    assert.equal(seen.json.job.phone, "");
    const offer = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/quotes", {
      price: 1500, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", duration: "2h", depositType: "none"
    });
    assert.equal(offer.status, 201);
    const leaked = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/messages", { text: "Email me at priya@wire.example" });
    assert.equal(leaked.status, 400);
    const early = await alex("POST", "/api/jobs/" + posted.json.job.id + "/approve", { quoteId: offer.json.quoteId });
    assert.equal(early.status, 400);
  } finally {
    await server.close();
  }
});

test("approving a quote does not mark it paid, and an invoice above the approved total is not requested", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const plumber = client(server.base);
  try {
    const { building } = await readyManager(alex, server, manager());
    const posted = await alex("POST", "/api/jobs", { buildingId: building.id, title: "Garden tap", area: "Bin room", tradeId: "plumbing", urgency: "standard" });
    await signIn(plumber, server, {
      kind: "contractor", name: "Sam Okonkwo", businessName: "Sam Plumbing", email: "sam@plumbing.example",
      mobile: "0400222333", password: "Pipes123", confirm: "Pipes123", agree: true
    });
    await plumber("PATCH", "/api/me/work", { trades: ["plumbing"], basePostcode: "3000" });
    const offer = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/quotes", {
      price: 400, scope: ["Replace the washer"], date: "2026-11-20", time: "09:00", depositType: "none"
    });
    const approved = await alex("POST", "/api/jobs/" + posted.json.job.id + "/approve", { quoteId: offer.json.quoteId });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.paid, false);
    assert.equal(approved.json.stage, "paid");
    const address = await plumber("GET", "/api/jobs/" + posted.json.job.id);
    assert.equal(address.json.job.place.streetNumber, "42");
    const invoice = await plumber("POST", "/api/jobs/" + posted.json.job.id + "/invoice", { amount: 900 });
    assert.equal(invoice.json.hold, true);
    assert.equal(invoice.json.dueCents, 0);
    assert.equal(invoice.json.paid, false);
  } finally {
    await server.close();
  }
});
