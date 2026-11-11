import test from "node:test";
import assert from "node:assert/strict";
import { client, lastLink, startApp } from "./helpers.js";

function manager(extra = {}) {
  return {
    kind: "manager",
    role: "building_manager",
    name: "Jordan Hale",
    email: "jordan@harbour.example",
    mobile: "0418000222",
    password: "Harbour1",
    confirm: "Harbour1",
    agree: true,
    ...extra
  };
}

async function verified(api, server, details = manager()) {
  const created = await api("POST", "/api/register", details);
  assert.equal(created.status, 201);
  const { link } = lastLink(server.config.outboxPath);
  const confirmed = await api("GET", link.slice(link.indexOf("/api/")));
  assert.equal(confirmed.status, 302);
  return details;
}

test("remember-me keeps a 30-day cookie, and a normal sign-in expires with the browser", async () => {
  const server = await startApp();
  const api = client(server.base);
  try {
    const details = await verified(api, server);
    const kept = await api("POST", "/api/login", { email: details.email, password: details.password, keep: true });
    assert.equal(kept.status, 200);
    const keptCookie = kept.headers.getSetCookie().join(" ");
    assert.match(keptCookie, /HttpOnly/);
    assert.match(keptCookie, /SameSite=Lax/);
    assert.match(keptCookie, /Max-Age=2592000/);
    const keptRow = server.app.locals.db.prepare("SELECT expires_at, keep_signed_in FROM sessions").all();
    assert.equal(keptRow.length, 1);
    assert.equal(keptRow[0].keep_signed_in, 1);
    const keptDays = (Date.parse(keptRow[0].expires_at) - Date.now()) / 86400000;
    assert.ok(keptDays > 29 && keptDays < 31);

    await api("POST", "/api/logout", {});
    const brief = await api("POST", "/api/login", { email: details.email, password: details.password, keep: false });
    assert.equal(brief.status, 200);
    const briefCookie = brief.headers.getSetCookie().find(item => item.startsWith("strata_session="));
    assert.equal(briefCookie.includes("Max-Age="), false);
    assert.match(briefCookie, /HttpOnly/);
    const briefRow = server.app.locals.db.prepare("SELECT expires_at, keep_signed_in FROM sessions").get();
    assert.equal(briefRow.keep_signed_in, 0);
    const briefHours = (Date.parse(briefRow.expires_at) - Date.now()) / 3600000;
    assert.ok(briefHours > 11 && briefHours < 13);

    server.app.locals.db.prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    const expired = await api("GET", "/api/me");
    assert.equal(expired.status, 401);
    assert.equal(server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  } finally {
    await server.close();
  }
});

test("signing out ends only that device, and sign out of all devices ends every session", async () => {
  const server = await startApp();
  const pc = client(server.base);
  const phone = client(server.base);
  try {
    const details = await verified(pc, server);
    const pcIn = await pc("POST", "/api/login", { email: details.email, password: details.password, keep: true });
    const phoneIn = await phone("POST", "/api/login", {
      email: details.email,
      password: details.password,
      keep: true
    });
    assert.equal(pcIn.status, 200);
    assert.equal(phoneIn.status, 200);
    const phoneCookie = phoneIn.headers.getSetCookie().find(item => item.startsWith("strata_session=")).split(";")[0];
    const listed = await pc("GET", "/api/me/sessions");
    assert.equal(listed.json.devices.length, 2);
    assert.equal(listed.json.devices.filter(device => device.current).length, 1);

    const out = await pc("POST", "/api/logout", {});
    assert.equal(out.status, 200);
    assert.equal((await pc("GET", "/api/me")).status, 401);
    assert.equal((await phone("GET", "/api/me")).status, 200);
    assert.equal((await phone("GET", "/api/me/sessions")).json.devices.length, 1);

    const all = await phone("POST", "/api/me/sessions/sign-out-all", {});
    assert.equal(all.status, 200);
    assert.equal((await phone("GET", "/api/me")).status, 401);
    const oldPhone = await fetch(server.base + "/api/me", { headers: { cookie: phoneCookie, "x-requested-with": "StrataApp" } });
    assert.equal(oldPhone.status, 401);
    assert.equal(server.app.locals.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  } finally {
    await server.close();
  }
});

test("a notice keeps the signed-in name and its day, and follows the account to another device", async () => {
  const server = await startApp();
  const pc = client(server.base);
  const phone = client(server.base);
  const other = client(server.base);
  try {
    const details = await verified(pc, server);
    await pc("POST", "/api/login", { email: details.email, password: details.password, keep: false });
    const note = await pc("POST", "/api/notes", {
      text: "Plumber coming Tuesday.",
      date: "2026-11-17",
      author_name: "Not The Manager",
      author: "Typed Name",
      name: "Someone Else"
    });
    assert.equal(note.status, 201);
    assert.equal(note.json.note.author_name, "Jordan Hale");
    assert.equal(note.json.note.notice_on, "2026-11-17");
    assert.equal(JSON.stringify(note.json).includes("Not The Manager"), false);

    await phone("POST", "/api/login", { email: details.email, password: details.password, keep: true });
    const seen = await phone("GET", "/api/notes");
    assert.equal(seen.json.notes[0].author_name, "Jordan Hale");
    assert.equal(seen.json.notes[0].notice_on, "2026-11-17");

    const saved = await pc("PATCH", "/api/me/preferences", {
      buildingId: "",
      calYear: 2026,
      calMonth: 10,
      noteYear: 2026,
      noteMonth: 10,
      noteDay: "2026-11-17"
    });
    assert.equal(saved.status, 200);
    const followed = await phone("GET", "/api/me");
    assert.equal(followed.json.user.name, "Jordan Hale");
    assert.equal(followed.json.preferences.noteDay, "2026-11-17");
    assert.equal(followed.json.preferences.calMonth, 10);

    const refused = await pc("PATCH", "/api/me/preferences", {
      buildingId: "building-from-another-account",
      calYear: 2026,
      calMonth: 10,
      noteYear: 2026,
      noteMonth: 10,
      noteDay: "2026-11-17"
    });
    assert.equal(refused.status, 400);

    await verified(other, server, manager({ email: "sam@other.example", name: "Sam Okonkwo" }));
    await other("POST", "/api/login", { email: "sam@other.example", password: "Harbour1" });
    const hidden = await other("GET", "/api/notes");
    assert.equal(hidden.json.notes.length, 0);
    const badDay = await pc("POST", "/api/notes", { text: "No day", date: "2026-02-31" });
    assert.equal(badDay.status, 400);
  } finally {
    await server.close();
  }
});
