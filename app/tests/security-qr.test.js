import test from "node:test";
import assert from "node:assert/strict";
import { client, lastLink, startApp } from "./helpers.js";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64");

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

function manager(email) {
  return {
    kind: "manager", role: "building_manager", name: "Alex Nguyen", email, mobile: "0418220184",
    password: "Harbour1", confirm: "Harbour1", agree: true
  };
}

async function buildingAndPlace(server, api, email) {
  await signIn(api, server, manager(email));
  await api("PATCH", "/api/me", { abn: "51824753556", consent: true, payment: "bank", businessName: "Harbour View OC" });
  const building = await api("POST", "/api/buildings", {
    name: "Harbour View", streetNumber: "42", street: "Collins Street", suburb: "Melbourne", postcode: "3000", ocPlan: "PS 1"
  });
  const place = await api("POST", "/api/buildings/" + building.json.building.id + "/places", { kind: "lift", name: "Lift 1", level: "Ground" });
  return { building: building.json.building, place: place.json.place };
}

function reportBody(token, extra = {}) {
  return {
    token, description: "The lift door stays open", kind: "lift", name: "Rita Resident",
    contact: "rita@example.com", consent: true, botA: 2, botB: 3, botAnswer: 5, idempotencyKey: "once-" + token, ...extra
  };
}

test("a public report lands in the right building and nowhere else", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const sam = client(server.base);
  const guest = client(server.base);
  try {
    const { building, place } = await buildingAndPlace(server, alex, "alex@harbour.example");
    const page = await fetch(server.base + "/r/" + place.token);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Harbour View/);
    assert.match(html, /Lift 1/);
    assert.match(html, /call 000/);
    const created = await guest("POST", "/api/public/reports", reportBody(place.token));
    assert.equal(created.status, 201);
    assert.match(created.json.reference, /RP-/);
    const again = await guest("POST", "/api/public/reports", reportBody(place.token));
    assert.equal(again.json.duplicate, true);
    const queue = await alex("GET", "/api/reports?buildingId=" + building.id);
    assert.equal(queue.json.reports.length, 1);
    await signIn(sam, server, manager("sam@other.example"));
    const foreign = await sam("GET", "/api/reports?buildingId=" + building.id);
    assert.equal(foreign.status, 404);
    const unknown = await fetch(server.base + "/r/not-a-real-token");
    assert.equal(unknown.status, 404);
    assert.match(await unknown.text(), /not active/);
  } finally {
    await server.close();
  }
});

test("a switched-off or replaced code creates nothing, and a bad file is refused", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const guest = client(server.base);
  try {
    const { place } = await buildingAndPlace(server, alex, "alex2@harbour.example");
    await alex("POST", "/api/places/" + place.id + "/active", { active: false });
    const dead = await guest("POST", "/api/public/reports", reportBody(place.token, { idempotencyKey: "dead" }));
    assert.equal(dead.status, 404);
    const replaced = await alex("POST", "/api/places/" + place.id + "/replace", {});
    const oldCode = await guest("POST", "/api/public/reports", reportBody(place.token, { idempotencyKey: "old" }));
    assert.equal(oldCode.status, 404);
    const fresh = await guest("POST", "/api/public/reports", reportBody(replaced.json.place.token, { idempotencyKey: "new" }));
    assert.equal(fresh.status, 201);
    const bad = await guest("POST", "/api/public/reports", reportBody(replaced.json.place.token, {
      idempotencyKey: "file", photos: [Buffer.from("not an image at all").toString("base64")]
    }));
    assert.equal(bad.status, 400);
    const good = await guest("POST", "/api/public/reports", reportBody(replaced.json.place.token, {
      idempotencyKey: "photo", photos: [png]
    }));
    assert.equal(good.status, 201);
  } finally {
    await server.close();
  }
});

test("converting a report does not give the contractor the reporter's name, and printing stays locked", async () => {
  const server = await startApp({ securityGate: false });
  const alex = client(server.base);
  const guest = client(server.base);
  try {
    const { place } = await buildingAndPlace(server, alex, "alex3@harbour.example");
    server.app.locals.db.prepare("UPDATE buildings SET emergency_emails = ?").run("desk@harbour.example");
    const created = await guest("POST", "/api/public/reports", reportBody(place.token, { emergency: true, idempotencyKey: "em" }));
    assert.equal(created.status, 201);
    const messages = server.app.locals.mail.readAll();
    const urgent = messages.find(item => String(item.subject || "").startsWith("URGENT:"));
    assert.ok(urgent);
    assert.equal(urgent.subject.includes("Lift 1"), true);
    const report = server.app.locals.db.prepare("SELECT id FROM reports WHERE reference = ?").get(created.json.reference);
    const converted = await alex("POST", "/api/reports/" + report.id + "/convert", {});
    assert.equal(converted.status, 201);
    assert.equal(converted.json.leakedReporter, false);
    const sheet = await alex("GET", "/api/places/" + place.id + "/sheet");
    assert.equal(sheet.status, 403);
  } finally {
    await server.close();
  }
  const open = await startApp({ securityGate: true, publicBaseUrl: "https://qr.taskspeck.com.au" });
  const manager = client(open.base);
  try {
    const { place } = await buildingAndPlace(open, manager, "alex4@harbour.example");
    const sheet = await manager("GET", "/api/places/" + place.id + "/sheet");
    assert.equal(sheet.status, 200);
    assert.match(sheet.text, /call 000/);
  } finally {
    await open.close();
  }
});
