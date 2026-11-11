import test from "node:test";
import assert from "node:assert/strict";
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

async function verifiedSession(api, server, details = manager()) {
  const created = await api("POST", "/api/register", details);
  assert.equal(created.status, 201);
  const { link } = lastLink(server.config.outboxPath);
  const verified = await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal(verified.status, 302);
  const signed = await api("POST", "/api/login", { email: details.email, password: details.password });
  assert.equal(signed.status, 200);
  return signed.json.user;
}

test("a new account must confirm the email before it can sign in", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    const created = await api("POST", "/api/register", manager());
    assert.equal(created.status, 201);
    assert.equal(created.json.emailSent, false);
    const early = await api("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" });
    assert.equal(early.status, 403);
    const hidden = await api("GET", "/api/me");
    assert.equal(hidden.status, 401);
    const { link, message } = lastLink(server.config.outboxPath);
    assert.match(message.subject, /Confirm your TaskSpeck Strata email/);
    assert.equal(message.text.includes("Harbour1"), false);
    const verified = await api("GET", link.slice(link.indexOf("/api/")));
    assert.equal(verified.status, 302);
    assert.match(verified.headers.get("location"), /verified=1/);
    const again = await api("GET", link.slice(link.indexOf("/api/")));
    assert.match(again.headers.get("location"), /verify=invalid/);
    const signed = await api("POST", "/api/login", { email: "Alex@Harbour.example", password: "Harbour1" });
    assert.equal(signed.status, 200);
    assert.equal(signed.json.user.role, "building_manager");
    assert.equal(signed.json.user.emailVerified, true);
  } finally {
    await server.close();
  }
});

test("the wrong email and the wrong password get the same reply, then the email is paused", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    await verifiedSession(api, server);
    const unknown = await api("POST", "/api/login", { email: "nobody@harbour.example", password: "Harbour1" });
    const wrong = await api("POST", "/api/login", { email: "alex@harbour.example", password: "nope1234" });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.json.error, wrong.json.error);
    for (let i = 0; i < 4; i += 1) {
      await api("POST", "/api/login", { email: "alex@harbour.example", password: "nope1234" });
    }
    const paused = await api("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" });
    assert.equal(paused.status, 429);
    const other = await api("POST", "/api/login", { email: "nobody@harbour.example", password: "Harbour1" });
    assert.equal(other.status, 401);
  } finally {
    await server.close();
  }
});

test("a role is stored on the server and the browser cannot switch worlds", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    const user = await verifiedSession(api, server);
    assert.equal(user.world, "common");
    const toContractor = await api("PATCH", "/api/me", { role: "contractor" });
    assert.equal(toContractor.status, 403);
    const toProperty = await api("PATCH", "/api/me", { role: "property_manager" });
    assert.equal(toProperty.status, 403);
    const toOwner = await api("PATCH", "/api/me", { role: "platform_owner" });
    assert.equal(toOwner.status, 403);
    const toOc = await api("PATCH", "/api/me", { role: "oc_manager" });
    assert.equal(toOc.status, 200);
    assert.equal(toOc.json.user.role, "oc_manager");
    const propertyApi = client(server.base);
    await verifiedSession(propertyApi, server, manager({
      role: "property_manager",
      email: "pat@rentals.example",
      name: "Pat Ellis"
    }));
    const stuck = await propertyApi("PATCH", "/api/me", { role: "building_manager" });
    assert.equal(stuck.status, 403);
    const ownerPage = await propertyApi("GET", "/api/owner/settings");
    assert.equal(ownerPage.status, 403);
  } finally {
    await server.close();
  }
});

test("notes stay inside the organisation and a download leaves out the password", async () => {
  const server = await startApp();
  const api = client(server.base);
  const other = client(server.base);
  try {
    await verifiedSession(api, server);
    await verifiedSession(other, server, manager({ email: "sam@other.example", name: "Sam Okonkwo" }));
    const note = await api("POST", "/api/notes", { text: "The plant-room key is with the concierge." });
    assert.equal(note.status, 201);
    const mine = await api("GET", "/api/notes");
    const theirs = await other("GET", "/api/notes");
    assert.equal(mine.json.notes.length, 1);
    assert.equal(theirs.json.notes.length, 0);
    const contractor = client(server.base);
    await verifiedSession(contractor, server, {
      kind: "contractor",
      role: "contractor",
      name: "Sam Okonkwo",
      businessName: "Sam Plumbing",
      email: "sam@plumbing.example",
      mobile: "0400111222",
      password: "Pipes123",
      confirm: "Pipes123",
      agree: true
    });
    const blocked = await contractor("POST", "/api/notes", { text: "hello" });
    assert.equal(blocked.status, 403);
    const file = await api("GET", "/api/me/export");
    assert.equal(file.status, 200);
    assert.equal(JSON.stringify(file.json).includes("password"), false);
    assert.equal(file.json.profile.email, "alex@harbour.example");
    const privacy = await api("POST", "/api/privacy-requests", { kind: "copy", detail: "Please send my profile." });
    assert.equal(privacy.status, 201);
    assert.match(privacy.json.message, /30 days/);
  } finally {
    await server.close();
  }
});

test("a reset link works once and the old password stops working", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    await verifiedSession(api, server);
    const asked = await api("POST", "/api/forgot-password", { email: "alex@harbour.example" });
    assert.equal(asked.status, 200);
    const missing = await api("POST", "/api/forgot-password", { email: "missing@harbour.example" });
    assert.equal(missing.json.message, asked.json.message);
    const { link } = lastLink(server.config.outboxPath);
    const token = new URL(link).searchParams.get("token");
    const reset = await api("POST", "/api/reset-password", { token, password: "Harbour2", confirm: "Harbour2" });
    assert.equal(reset.status, 200);
    const old = await api("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour1" });
    assert.equal(old.status, 401);
    const fresh = await api("POST", "/api/login", { email: "alex@harbour.example", password: "Harbour2" });
    assert.equal(fresh.status, 200);
    const reused = await api("POST", "/api/reset-password", { token, password: "Harbour3", confirm: "Harbour3" });
    assert.equal(reused.status, 400);
  } finally {
    await server.close();
  }
});

test("registration refuses a weak password, a missing agreement and a duplicate email", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    const weak = await api("POST", "/api/register", manager({ password: "password", confirm: "password" }));
    assert.equal(weak.status, 400);
    const emailInside = await api("POST", "/api/register", manager({ password: "alex@harbour.example1", confirm: "alex@harbour.example1" }));
    assert.equal(emailInside.status, 400);
    const noAgree = await api("POST", "/api/register", manager({ agree: false }));
    assert.equal(noAgree.status, 400);
    await api("POST", "/api/register", manager());
    const dup = await api("POST", "/api/register", manager());
    assert.equal(dup.status, 400);
    const bare = await fetch(server.base + "/api/register", { method: "POST", body: "{}" });
    assert.equal(bare.status, 400);
  } finally {
    await server.close();
  }
});

test("an ABN with a bad check digit is refused and sign-out ends the session", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    await verifiedSession(api, server);
    const bad = await api("PATCH", "/api/me", { abn: "12345678901" });
    assert.equal(bad.status, 400);
    const good = await api("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View Owners Corporation" });
    assert.equal(good.status, 200);
    assert.equal(good.json.user.abn, "51824753556");
    const out = await api("POST", "/api/logout", {});
    assert.equal(out.status, 200);
    const me = await api("GET", "/api/me");
    assert.equal(me.status, 401);
  } finally {
    await server.close();
  }
});
