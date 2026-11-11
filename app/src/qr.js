import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit } from "./db.js";
import { newId } from "./ids.js";
import { securityGateOpen } from "./security-gate.js";

const KINDS = ["plumbing", "electrical", "lift", "doors", "cleaning", "rubbish", "fire", "aircon", "roof", "other", "unsure"];
const recent = [];

export function registerQrRoutes(app, { db, config, mail, sendError, requireUser, requireJson }) {
  app.get("/r/:token", (req, res) => {
    const place = placeByToken(db, req.params.token);
    if (!place || !place.active) {
      res.status(404).type("html").send(page("This QR code is not active", "<p>This code cannot take a report. If anyone is in danger, call 000.</p>"));
      return;
    }
    const a = randomBytes(2).readUInt16BE(0) % 8 + 1;
    const b = randomBytes(2).readUInt16BE(0) % 8 + 1;
    res.type("html").send(page(place.building_name + " · " + place.name, formHtml(place, a, b)));
  });

  app.post("/api/public/reports", requireJson, async (req, res) => {
    if (req.body?.website) return res.json({ ok: true, reference: "RP-0000" });
    const place = placeByToken(db, String(req.body?.token || ""));
    if (!place || !place.active || !place.reporting_on) return sendError(res, 404, "This QR code is not active.");
    const ip = req.ip || "local";
    if (tooMany(place.id + ":" + ip, 10 * 60 * 1000, 3) || tooMany(place.id, 60 * 60 * 1000, 20)) {
      return sendError(res, 429, "Too many reports from this code. Wait and try again.");
    }
    const answer = Number(req.body?.botAnswer);
    if (answer !== Number(req.body?.botA) + Number(req.body?.botB)) return sendError(res, 400, "The check answer was not right.");
    if (!req.body?.consent) return sendError(res, 400, "Tick the privacy box to send the report.");
    const description = String(req.body?.description || "").trim();
    if (description.length < 3) return sendError(res, 400, "Say what the problem is.");
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : "unsure";
    const emergency = !!req.body?.emergency;
    const contact = String(req.body?.contact || "").trim();
    if (!emergency && place.contact_required && !contact) return sendError(res, 400, "Add an email or a phone number so the manager can reply.");
    if (contact && !emailOrPhone(contact)) return sendError(res, 400, "Add an email or a phone number.");
    const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];
    if (photos.length > 10) return sendError(res, 400, "You can add up to 10 photographs.");
    const stored = [];
    for (const item of photos) {
      const result = saveReportPhoto(Buffer.from(String(item), "base64"));
      if (!result.ok) return sendError(res, 400, result.error);
      stored.push(result.bytes);
    }
    const key = String(req.body?.idempotencyKey || "");
    if (key) {
      const prior = db.prepare("SELECT reference FROM reports WHERE idempotency_key = ?").get(key);
      if (prior) return res.json({ ok: true, reference: prior.reference, duplicate: true });
    }
    const id = newId();
    const count = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE organisation_id = ?").get(place.organisation_id).n + 1;
    const reference = "RP-" + String(count).padStart(4, "0");
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO reports (id, building_id, organisation_id, place_id, reference, kind, description, emergency, status, reporter_name, reporter_contact, idempotency_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?)`).run(
      id, place.building_id, place.organisation_id, place.id, reference, kind, description.slice(0, 2000),
      emergency ? 1 : 0, String(req.body?.name || "").slice(0, 200), contact.slice(0, 200), key || null, now
    );
    stored.forEach((bytes, index) => writePrivatePhoto(config, id + "-" + index + ".img", bytes));
    addReportEvent(db, id, "Reporter", "Report received.");
    if (emergency) await sendUrgent(db, mail, place, id, reference);
    audit(db, { organisationId: place.organisation_id, action: "report.received", subjectType: "report", subjectId: id, detail: { emergency, placeId: place.id } });
    res.status(201).json({ ok: true, reference, message: "The building manager will review this. This is not an emergency service. If anyone is in danger, call 000." });
  });

  app.post("/api/public/reports/:reference/photos", requireUser, (req, res) => {
    sendError(res, 403, "Photographs are uploaded with the public report, not from a signed-in account on this address.");
  });

  app.post("/api/buildings/:id/places", requireJson, requireUser, (req, res) => {
    const building = ownBuilding(db, req.user, req.params.id);
    if (!building) return sendError(res, 404, "That building is not on your account.");
    if (building.world !== "common") return sendError(res, 403, "QR reporting is for common property, not for a private rental.");
    const name = String(req.body?.name || "").trim();
    if (name.length < 2) return sendError(res, 400, "Name the place.");
    const id = newId();
    const token = randomBytes(16).toString("hex");
    db.prepare(`INSERT INTO places (id, building_id, organisation_id, kind, name, level, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, building.id, building.organisation_id, String(req.body?.kind || "other"), name, String(req.body?.level || ""), token, new Date().toISOString());
    audit(db, { actorId: req.user.id, organisationId: building.organisation_id, action: "place.created", subjectType: "place", subjectId: id, detail: {} });
    res.status(201).json({ place: { id, name, token, active: true } });
  });

  app.post("/api/places/:id/active", requireJson, requireUser, (req, res) => {
    const place = ownPlace(db, req.user, req.params.id);
    if (!place) return sendError(res, 404, "That place is not on your account.");
    db.prepare("UPDATE places SET active = ? WHERE id = ?").run(req.body?.active ? 1 : 0, place.id);
    res.json({ active: !!req.body?.active });
  });

  app.post("/api/places/:id/replace", requireJson, requireUser, (req, res) => {
    const place = ownPlace(db, req.user, req.params.id);
    if (!place) return sendError(res, 404, "That place is not on your account.");
    db.prepare("UPDATE places SET active = 0 WHERE id = ?").run(place.id);
    const id = newId();
    const token = randomBytes(16).toString("hex");
    db.prepare(`INSERT INTO places (id, building_id, organisation_id, kind, name, level, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, place.building_id, place.organisation_id, place.kind, place.name, place.level, token, new Date().toISOString());
    res.status(201).json({ place: { id, token, replaced: place.id } });
  });

  app.get("/api/reports", requireUser, (req, res) => {
    const building = ownBuilding(db, req.user, String(req.query.buildingId || ""));
    if (!building) return sendError(res, 404, "That building is not on your account.");
    const rows = db.prepare("SELECT id, reference, kind, description, emergency, status, created_at, place_id FROM reports WHERE building_id = ? AND organisation_id = ? ORDER BY created_at DESC")
      .all(building.id, req.user.organisation_id);
    res.json({ reports: rows });
  });

  app.get("/api/reports/:id", requireUser, (req, res) => {
    const report = ownReport(db, req.user, req.params.id);
    if (!report) return sendError(res, 404, "That report is not on your account.");
    res.json({
      report: {
        id: report.id,
        reference: report.reference,
        kind: report.kind,
        description: report.description,
        status: report.status,
        emergency: !!report.emergency,
        reporterName: report.reporter_name,
        reporterContact: report.reporter_contact,
        history: db.prepare("SELECT at, actor, body FROM report_events WHERE report_id = ? ORDER BY id").all(report.id)
      }
    });
  });

  app.post("/api/reports/:id/convert", requireJson, requireUser, (req, res) => {
    const report = ownReport(db, req.user, req.params.id);
    if (!report) return sendError(res, 404, "That report is not on your account.");
    const place = db.prepare("SELECT * FROM places WHERE id = ?").get(report.place_id);
    const jobId = newId();
    const payload = { safety: ["no", "no", "no", "no", "no", "no", "no"], photos: 0, reference: report.reference, date: "" };
    db.prepare(`INSERT INTO jobs (id, organisation_id, building_id, created_by, title, area, trade_id, instructions, urgency, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      jobId, report.organisation_id, report.building_id, req.user.id,
      report.kind + " report", place.name, report.kind === "unsure" ? "other" : mapTrade(report.kind),
      report.description, report.emergency ? "emergency" : "standard", JSON.stringify(payload), new Date().toISOString()
    );
    db.prepare("UPDATE reports SET status = 'APPROVED', job_id = ? WHERE id = ?").run(jobId, report.id);
    addReportEvent(db, report.id, req.user.name, "Converted to a maintenance job. Reporter details were not copied.");
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
    const text = JSON.stringify(job);
    res.status(201).json({ jobId, leakedReporter: text.includes(report.reporter_name) && report.reporter_name !== "" });
  });

  app.get("/api/places/:id/sheet", requireUser, (req, res) => {
    const place = ownPlace(db, req.user, req.params.id);
    if (!place) return sendError(res, 404, "That place is not on your account.");
    if (!securityGateOpen(config)) return sendError(res, 403, "QR sheets stay off until the security tests pass.");
    if (!permanentHttps(config.publicBaseUrl)) return sendError(res, 403, "Set a permanent https address before printing. Do not print a code that points at a temporary address.");
    res.type("html").send(page("Labels", "<p>In an emergency call 000.</p><p>" + escapeHtml(place.name) + "</p><p>" + escapeHtml(config.publicBaseUrl) + "/r/" + escapeHtml(place.token) + "</p>"));
  });

  app.post("/api/reports/:id/photos", requireJson, requireUser, (req, res) => {
    sendError(res, 404, "That report is not on your account.");
  });
}

export function saveReportPhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.length > 3 * 1024 * 1024) return { ok: false, error: "Use a JPEG, PNG or WebP under 3 MB." };
  const kind = imageKind(buffer);
  if (!kind) return { ok: false, error: "That file is not an accepted photograph." };
  const cleaned = kind === "jpeg" ? stripJpegExif(buffer) : buffer;
  return { ok: true, bytes: cleaned, kind };
}

function placeByToken(db, token) {
  return db.prepare(`SELECT places.*, buildings.name AS building_name, buildings.street_number, buildings.street, buildings.suburb, buildings.emergency_emails,
      buildings.world, 1 AS reporting_on, 0 AS contact_required
    FROM places JOIN buildings ON buildings.id = places.building_id WHERE places.token = ?`).get(token);
}

function ownBuilding(db, user, id) {
  return db.prepare(`SELECT buildings.* FROM buildings
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE buildings.id = ? AND buildings.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function ownPlace(db, user, id) {
  return db.prepare(`SELECT places.* FROM places
    JOIN building_assignments ON building_assignments.building_id = places.building_id
    WHERE places.id = ? AND places.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function ownReport(db, user, id) {
  return db.prepare(`SELECT reports.* FROM reports
    JOIN building_assignments ON building_assignments.building_id = reports.building_id
    WHERE reports.id = ? AND reports.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function addReportEvent(db, reportId, actor, body) {
  db.prepare("INSERT INTO report_events (report_id, at, actor, body) VALUES (?, ?, ?, ?)").run(reportId, new Date().toISOString(), actor, body);
}

function tooMany(key, windowMs, max) {
  const now = Date.now();
  for (let i = recent.length - 1; i >= 0; i -= 1) if (now - recent[i].at > windowMs) recent.splice(i, 1);
  const count = recent.filter(item => item.key === key).length;
  if (count >= max) return true;
  recent.push({ key, at: now });
  return false;
}

function emailOrPhone(value) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && !/[a-z]/i.test(value);
}

async function sendUrgent(db, mail, place, reportId, reference) {
  const addresses = String(place.emergency_emails || "").split(",").map(item => item.trim()).filter(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
  if (!addresses.length) {
    addReportEvent(db, reportId, "System", "Urgent email was not sent because no emergency email is set.");
    return;
  }
  await mail.send({
    to: addresses[0],
    subject: `URGENT: emergency report at ${place.name} (${reference})`,
    text: `If anyone is in danger, call 000. This is not an emergency service.\n\nA report was received at ${place.building_name}, ${place.name}.\nReference ${reference}.`
  });
  addReportEvent(db, reportId, "System", "Urgent email sent to " + addresses[0] + ".");
}

function mapTrade(kind) {
  if (kind === "doors") return "doors";
  if (kind === "rubbish") return "hard-rubbish";
  if (kind === "fire") return "fire";
  if (kind === "aircon") return "aircon";
  if (kind === "roof") return "roof";
  if (["plumbing", "electrical", "cleaning"].includes(kind)) return kind;
  return "other";
}

function permanentHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || host.endsWith("github.io") || host.endsWith("example.com") || host.endsWith("example.org")) return false;
    return host.includes(".");
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font:18px/1.45 system-ui,sans-serif;background:#F6F8FB;color:#0F172A}main{max-width:560px;margin:0 auto;padding:20px}h1{font-size:1.6rem}button,.btn{min-height:48px;width:100%;border:0;border-radius:14px;background:#1D4ED8;color:#fff;font:inherit;font-weight:700}label{display:block;font-weight:700;margin:14px 0 6px}input,textarea,select{width:100%;min-height:48px;border:1.5px solid #E2E8F0;border-radius:12px;padding:10px;font:inherit}textarea{min-height:96px}.warn{background:#FFF1F2;color:#9F1239;padding:12px;border-radius:14px}</style></head>
<body><main><p class="warn"><strong>If anyone is in danger, call 000.</strong> Strata App is not an emergency service.</p><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
}

function formHtml(place, a, b) {
  const address = `${place.street_number} ${place.street}, ${place.suburb}`;
  return `<p>${escapeHtml(place.building_name)}</p><p>${escapeHtml(address)}</p><p>${escapeHtml(place.name)}${place.level ? " · " + escapeHtml(place.level) : ""}</p>
<form id="report">
<input type="hidden" name="website" tabindex="-1" autocomplete="off">
<label>What is the problem?<textarea name="description" required></textarea></label>
<label>Kind of problem<select name="kind"><option>unsure</option><option>plumbing</option><option>electrical</option><option>lift</option><option>doors</option><option>cleaning</option><option>rubbish</option><option>fire</option><option>aircon</option><option>roof</option><option>other</option></select></label>
<label>Your name<input name="name"></label>
<label>Email or phone<input name="contact"></label>
<label><input type="checkbox" name="emergency"> Someone is in danger here, after calling 000</label>
<label><input type="checkbox" name="consent" required> I agree this report and any photographs are for the building manager.</label>
<p>What is ${a} + ${b}?<input name="bot" inputmode="numeric" required></p>
<button type="submit">Send the report</button>
</form>
<p id="done"></p>
<script>
const key = sessionStorage.getItem("strata-report") || (Math.random().toString(36).slice(2) + Date.now());
sessionStorage.setItem("strata-report", key);
const draftKey = "strata-draft-" + ${JSON.stringify(place.token)};
const form = document.getElementById("report");
try { const saved = JSON.parse(localStorage.getItem(draftKey) || "{}"); for (const el of form.elements) if (saved[el.name] && el.type !== "checkbox") el.value = saved[el.name]; } catch (e) {}
form.addEventListener("input", () => { const data = {}; for (const el of form.elements) if (el.name && el.type !== "checkbox") data[el.name] = el.value; localStorage.setItem(draftKey, JSON.stringify(data)); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { token: ${JSON.stringify(place.token)}, description: form.description.value, kind: form.kind.value, name: form.name.value, contact: form.contact.value, emergency: form.emergency.checked, consent: form.consent.checked, website: form.website.value, botA: ${a}, botB: ${b}, botAnswer: Number(form.bot.value), idempotencyKey: key };
  const res = await fetch("/api/public/reports", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "StrataApp" }, body: JSON.stringify(body) });
  const json = await res.json();
  document.getElementById("done").textContent = (json.reference ? "Reference " + json.reference + ". " : "") + (json.message || json.error || "");
});
</script>`;
}

function imageKind(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "";
}

function stripJpegExif(buffer) {
  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    const size = buffer.readUInt16BE(offset + 2);
    const segment = buffer.subarray(offset, offset + 2 + size);
    if (marker !== 0xe1) chunks.push(segment);
    offset += 2 + size;
  }
  return Buffer.concat(chunks);
}

export function signPhoto(id, secret) {
  return createHmac("sha256", secret).update(id).digest("hex");
}

export function photoSignatureMatches(id, given, secret) {
  const expected = signPhoto(id, secret);
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function photoDir(config) {
  return path.join(path.dirname(config.databasePath), "photos");
}

export function writePrivatePhoto(config, name, bytes) {
  const dir = photoDir(config);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), bytes);
}
