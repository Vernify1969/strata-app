import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_OC_MANAGER, DEMO_QR_RIVERSIDE, DEMO_QR_TOKEN } from "../src/demo-seed.js";
import { client, lastLink, startApp } from "./helpers.js";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64");

async function signIn(api, server, details) {
  assert.equal((await api("POST", "/api/register", details)).status, 201);
  const { link } = lastLink(server.config.outboxPath);
  await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal((await api("POST", "/api/login", { email: details.email, password: details.password })).status, 200);
}

function manager(email, role = "building_manager") {
  return {
    kind: "manager", role, name: "Alex Nguyen", email, mobile: "0418220184",
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
    unit: "12", email: "rita@example.com", phone: "0412000111", consent: true,
    botA: 2, botB: 3, botAnswer: 5, idempotencyKey: "qr-" + token + "-" + Math.random().toString(16).slice(2), ...extra
  };
}

test("a valid code files a report for that building, and a bad code is refused", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const sam = client(server.base);
  const guest = client(server.base);
  try {
    const { building, place } = await buildingAndPlace(server, alex, "alex.qr@harbour.example");
    assert.equal(place.token.length, 32);
    const page = await fetch(server.base + "/r/" + place.token);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Harbour View/);
    assert.match(html, /Lift 1/);
    assert.match(html, /call 000/);
    assert.equal(html.includes("Collins"), false);
    assert.equal(html.includes("name=\"website\""), true);
    const created = await guest("POST", "/api/public/reports", reportBody(place.token, { photos: [png] }));
    assert.equal(created.status, 201);
    const inbox = await alex("GET", "/api/reports");
    assert.equal(inbox.json.reports.length, 1);
    assert.equal(inbox.json.reports[0].buildingName, "Harbour View");
    assert.equal(inbox.json.reports[0].placeName, "Lift 1");
    const detail = await alex("GET", "/api/reports/" + inbox.json.reports[0].id);
    assert.equal(detail.json.report.unit, "12");
    assert.equal(detail.json.report.reporterName, "Rita Resident");
    const notes = server.app.locals.mail.readAll();
    assert.ok(notes.some(item => item.to === "rita@example.com" && item.subject.includes(created.json.reference) && !item.subject.startsWith("URGENT")));
    const honeypot = await guest("POST", "/api/public/reports", reportBody(place.token, { website: "https://spam.example" }));
    assert.equal(honeypot.json.reference, "RP-0000");
    assert.equal((await alex("GET", "/api/reports")).json.reports.length, 1);

    await alex("POST", "/api/places/" + place.id + "/active", { active: false });
    const dead = await guest("POST", "/api/public/reports", reportBody(place.token));
    assert.equal(dead.status, 404);
    const unknown = await guest("POST", "/api/public/reports", reportBody("not-a-real-token"));
    assert.equal(unknown.status, 404);
    const svg = await alex("GET", "/api/places/" + place.id + "/qr.svg");
    assert.equal(svg.status, 404);

    await signIn(sam, server, manager("sam.qr@other.example"));
    const foreign = await sam("GET", "/api/reports/" + inbox.json.reports[0].id);
    assert.equal(foreign.status, 404);
    const foreignList = await sam("GET", "/api/reports");
    assert.equal(foreignList.json.reports.length, 0);
    const foreignPng = await sam("GET", "/api/places/" + place.id + "/qr.png");
    assert.equal(foreignPng.status, 404);
  } finally {
    await server.close();
  }
});

test("the same code stops accepting reports after a few tries", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const guest = client(server.base);
  try {
    const { place } = await buildingAndPlace(server, alex, "alex.limit@harbour.example");
    for (let n = 0; n < 3; n += 1) {
      const sent = await guest("POST", "/api/public/reports", reportBody(place.token));
      assert.equal(sent.status, 201);
    }
    const blocked = await guest("POST", "/api/public/reports", reportBody(place.token));
    assert.equal(blocked.status, 429);
  } finally {
    await server.close();
  }
});

test("a manager can download a code and turn a report into a job", async () => {
  const server = await startApp();
  const alex = client(server.base);
  const guest = client(server.base);
  const stranger = client(server.base);
  try {
    const { building, place } = await buildingAndPlace(server, alex, "alex.job@harbour.example");
    const whole = await alex("POST", "/api/buildings/" + building.id + "/places", { name: "" });
    assert.equal(whole.json.place.name, "Whole building");
    const png = await alex("GET", "/api/places/" + place.id + "/qr.png");
    assert.equal(png.status, 200);
    assert.match(png.headers.get("content-type"), /image\/png/);
    const svg = await alex("GET", "/api/places/" + place.id + "/qr.svg");
    assert.equal(svg.status, 200);
    assert.match(svg.text, /<svg/);
    const locked = await stranger("GET", "/api/places/" + place.id + "/qr.png");
    assert.equal(locked.status, 401);
    const sheet = await alex("GET", "/api/places/" + place.id + "/sheet");
    assert.equal(sheet.status, 403);

    const created = await guest("POST", "/api/public/reports", reportBody(place.token));
    const report = server.app.locals.db.prepare("SELECT id FROM reports WHERE reference = ?").get(created.json.reference);
    const converted = await alex("POST", "/api/reports/" + report.id + "/convert", {});
    assert.equal(converted.status, 201);
    assert.equal(converted.json.leakedReporter, false);
    const jobs = await alex("GET", "/api/jobs");
    const job = jobs.json.jobs.find(item => item.id === converted.json.jobId);
    assert.equal(job.stage, "open");
    assert.equal(JSON.stringify(job).includes("Rita Resident"), false);
    const again = await alex("POST", "/api/reports/" + report.id + "/convert", {});
    assert.equal(again.status, 400);

    const second = await guest("POST", "/api/public/reports", reportBody(place.token, { description: "The bin room light is out" }));
    const other = server.app.locals.db.prepare("SELECT id FROM reports WHERE reference = ?").get(second.json.reference);
    const dismissed = await alex("POST", "/api/reports/" + other.id + "/dismiss", {});
    assert.equal(dismissed.json.status, "DISMISSED");
    const blocked = await alex("POST", "/api/reports/" + other.id + "/convert", {});
    assert.equal(blocked.status, 400);
  } finally {
    await server.close();
  }
});

test("the demo buildings have sample codes, and a private rental does not", async () => {
  const server = await startApp({ demoMode: true });
  const mina = client(server.base);
  const helen = client(server.base);
  const leo = client(server.base);
  try {
    assert.equal((await mina("POST", "/api/login", { email: "mina.costa@harbour.example", password: "Harbour1" })).status, 200);
    const codes = await mina("GET", "/api/qr-codes");
    assert.equal(codes.json.codes.length, 2);
    const page = await fetch(server.base + "/r/" + DEMO_QR_TOKEN);
    const html = await page.text();
    assert.match(html, /Harbour View Apartments/);
    assert.match(html, /Lift 1/);
    assert.equal(html.includes("Collins"), false);
    assert.equal((await mina("GET", "/api/places/" + codes.json.codes[0].id + "/sheet")).status, 403);
    const picture = await mina("GET", "/api/places/" + codes.json.codes[0].id + "/qr.svg");
    assert.equal(picture.status, 200);
    assert.equal((await helen("POST", "/api/login", { email: DEMO_OC_MANAGER.email, password: DEMO_OC_MANAGER.password })).status, 200);
    const riverside = await fetch(server.base + "/r/" + DEMO_QR_RIVERSIDE);
    const riversideHtml = await riverside.text();
    assert.match(riversideHtml, /Riverside Court/);
    assert.match(riversideHtml, /Car park gate/);
    assert.equal(riversideHtml.includes("Flinders"), false);
    assert.equal((await leo("POST", "/api/login", { email: "leo.park@southbanklets.example", password: "Lettings1" })).status, 200);
    const rental = await leo("GET", "/api/buildings");
    const refused = await leo("POST", "/api/buildings/" + rental.json.buildings[0].id + "/places", { name: "Front door" });
    assert.equal(refused.status, 403);
  } finally {
    await server.close();
  }
});
