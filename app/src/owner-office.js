import { audit } from "./db.js";
import { newId } from "./ids.js";
import { sendDueAlerts } from "./documents.js";
import { moneySettings } from "./payments.js";

const USER_FIELDS = `id, organisation_id, email, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at, suspended, suspended_reason, stripe_account_id`;

function ownerOnly(req, res, sendError) {
  if (req.user.role !== "platform_owner") {
    sendError(res, 403, "Only the platform owner can open this.");
    return false;
  }
  return true;
}

function safeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisation_id,
    email: row.email,
    role: row.role,
    name: row.name,
    mobile: row.mobile,
    businessName: row.business_name,
    abn: row.abn,
    emailVerified: !!row.email_verified_at,
    createdAt: row.created_at,
    suspended: !!row.suspended,
    suspendedReason: row.suspended_reason || "",
    stripeConnected: !!row.stripe_account_id
  };
}

function monthKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(now);
}

export function registerOwnerOffice(app, { db, mail, sendError, requireUser, requireJson, sendToken }) {
  function guard(req, res) {
    return ownerOnly(req, res, sendError);
  }

  app.get("/api/owner/overview", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const count = (sql) => db.prepare(sql).get().n;
    const expiring = db.prepare(`SELECT COUNT(*) AS n FROM contractor_documents WHERE expiry_on != '' AND expiry_on <= date('now', '+30 day')`).get().n;
    res.json({
      managers: count("SELECT COUNT(*) AS n FROM users WHERE role IN ('building_manager', 'oc_manager', 'property_manager')"),
      contractors: count("SELECT COUNT(*) AS n FROM users WHERE role = 'contractor'"),
      buildings: count("SELECT COUNT(*) AS n FROM buildings WHERE archived = 0"),
      openJobs: count("SELECT COUNT(*) AS n FROM jobs WHERE stage = 'open'"),
      openReports: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'NEW'"),
      moneyHeldCents: db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE status = 'succeeded' AND released_at = ''").get().n,
      moneyReleasedCents: db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE released_at != ''").get().n,
      feesEarnedCents: db.prepare("SELECT COALESCE(SUM(fee_cents), 0) AS n FROM payments WHERE status = 'succeeded'").get().n,
      documentsExpiring: expiring,
      refunds: "not available yet: refund rules not decided by Nick"
    });
  });

  app.get("/api/owner/users", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const role = String(req.query.role || "");
    const q = String(req.query.q || "").trim().toLowerCase();
    let rows = db.prepare(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC`).all();
    if (role) rows = rows.filter(row => row.role === role);
    if (q) rows = rows.filter(row => (row.email + " " + row.name + " " + row.business_name).toLowerCase().includes(q));
    res.json({ users: rows.map(safeUser) });
  });

  app.get("/api/owner/users/:id", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const row = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    const strikes = db.prepare("SELECT id, reason, created_at FROM contractor_strikes WHERE user_id = ? ORDER BY created_at DESC").all(row.id);
    const text = JSON.stringify(safeUser(row));
    res.json({ user: safeUser(row), strikes, passwordIncluded: text.includes("password") });
  });

  app.post("/api/owner/users/:id/suspend", requireJson, requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const row = db.prepare("SELECT id, email, suspended FROM users WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    if (row.id === req.user.id) return sendError(res, 400, "You cannot suspend your own account.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return sendError(res, 400, "Add a short reason.");
    const suspended = req.body?.suspended !== false;
    db.prepare("UPDATE users SET suspended = ?, suspended_reason = ? WHERE id = ?").run(suspended ? 1 : 0, reason, row.id);
    if (suspended) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: suspended ? "owner.user_suspended" : "owner.user_reactivated", subjectType: "user", subjectId: row.id, detail: { reason } });
    res.json({ suspended, reason });
  });

  app.post("/api/owner/users/:id/resend-verification", requireJson, requireUser, async (req, res) => {
    if (!guard(req, res)) return;
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    if (row.email_verified_at) return sendError(res, 400, "That email is already confirmed.");
    await sendToken(row, "verify");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.verification_resent", subjectType: "user", subjectId: row.id, detail: {} });
    res.json({ ok: true, message: "A confirmation email was sent." });
  });

  app.post("/api/owner/users/:id/send-reset", requireJson, requireUser, async (req, res) => {
    if (!guard(req, res)) return;
    const row = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    await sendToken(row, "reset");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.password_reset_sent", subjectType: "user", subjectId: row.id, detail: {} });
    res.json({ ok: true, message: "A password reset email was sent.", user: safeUser(row) });
  });

  app.post("/api/owner/users/:id/strikes", requireJson, requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const row = db.prepare("SELECT id, role FROM users WHERE id = ?").get(req.params.id);
    if (!row || row.role !== "contractor") return sendError(res, 404, "That contractor was not found.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return sendError(res, 400, "Add a short reason.");
    const id = newId();
    db.prepare("INSERT INTO contractor_strikes (id, user_id, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?)").run(id, row.id, reason, req.user.id, new Date().toISOString());
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.strike_noted", subjectType: "user", subjectId: row.id, detail: { reason } });
    res.status(201).json({ id, reason });
  });

  app.get("/api/owner/organisations", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const rows = db.prepare("SELECT id, name, world, created_at FROM organisations ORDER BY created_at").all();
    res.json({ organisations: rows });
  });

  app.get("/api/owner/buildings", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const rows = db.prepare("SELECT id, organisation_id, name, suburb, postcode, world, region_id, archived FROM buildings ORDER BY name").all();
    res.json({ buildings: rows });
  });

  app.patch("/api/owner/buildings/:id/region", requireJson, requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const building = db.prepare("SELECT id, region_id FROM buildings WHERE id = ?").get(req.params.id);
    if (!building) return sendError(res, 404, "That building was not found.");
    const region = db.prepare("SELECT id FROM regions WHERE id = ?").get(String(req.body?.regionId || ""));
    if (!region) return sendError(res, 400, "That region is not available.");
    db.prepare("UPDATE buildings SET region_id = ? WHERE id = ?").run(region.id, building.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.building_region", subjectType: "building", subjectId: building.id, detail: { from: building.region_id, to: region.id } });
    res.json({ regionId: region.id });
  });

  app.get("/api/owner/jobs", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const status = String(req.query.status || "");
    const buildingId = String(req.query.buildingId || "");
    let rows = db.prepare("SELECT id, title, stage, building_id, organisation_id, created_at FROM jobs ORDER BY created_at DESC").all();
    if (status) rows = rows.filter(row => row.stage === status);
    if (buildingId) rows = rows.filter(row => row.building_id === buildingId);
    res.json({ jobs: rows });
  });

  app.get("/api/owner/jobs/:id", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const job = db.prepare("SELECT id, title, stage, area, instructions, building_id, created_at FROM jobs WHERE id = ?").get(req.params.id);
    if (!job) return sendError(res, 404, "That job was not found.");
    const timeline = db.prepare("SELECT at, actor_name, body FROM job_events WHERE job_id = ? ORDER BY id").all(job.id);
    const quotes = db.prepare("SELECT id, price_cents, status, deposit_type, created_at FROM quotes WHERE job_id = ?").all(job.id);
    res.json({ job, timeline, quotes });
  });

  app.get("/api/owner/payments", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const filter = String(req.query.status || "");
    let rows = db.prepare("SELECT id, job_id, amount_cents, fee_cents, net_cents, status, released_at, payout_paused, payout_pause_reason, created_at FROM payments ORDER BY created_at DESC").all();
    rows = rows.map(row => ({
      ...row,
      ledger: row.released_at ? "released" : row.payout_paused ? "paused" : row.status === "succeeded" ? "held" : row.status === "requires_capture" ? "captured-waiting" : row.status
    }));
    if (filter) rows = rows.filter(row => row.ledger === filter || row.status === filter);
    res.json({
      payments: rows,
      refunds: "not available yet: refund rules not decided by Nick"
    });
  });

  app.post("/api/owner/payments/:id/pause", requireJson, requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const payment = db.prepare("SELECT id, released_at FROM payments WHERE id = ?").get(req.params.id);
    if (!payment) return sendError(res, 404, "That payment was not found.");
    if (payment.released_at) return sendError(res, 400, "That payout has already been released.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return sendError(res, 400, "Add a short reason.");
    const paused = req.body?.paused !== false;
    db.prepare("UPDATE payments SET payout_paused = ?, payout_pause_reason = ? WHERE id = ?").run(paused ? 1 : 0, reason, payment.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: paused ? "owner.payout_paused" : "owner.payout_resumed", subjectType: "payment", subjectId: payment.id, detail: { reason } });
    res.json({ paused, reason });
  });

  app.get("/api/owner/documents", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const rows = db.prepare(`SELECT contractor_documents.id, contractor_documents.kind, contractor_documents.expiry_on, contractor_documents.owner_check, contractor_documents.owner_note, contractor_documents.created_at, users.name AS contractor_name
      FROM contractor_documents JOIN users ON users.id = contractor_documents.user_id
      ORDER BY contractor_documents.created_at DESC`).all();
    res.json({
      documents: rows.map(row => ({ ...row, badge: row.owner_check ? "Owner " + row.owner_check : "Documents checked (self-declared)" }))
    });
  });

  app.post("/api/owner/documents/:id/review", requireJson, requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const doc = db.prepare("SELECT id FROM contractor_documents WHERE id = ?").get(req.params.id);
    if (!doc) return sendError(res, 404, "That document was not found.");
    const decision = req.body?.decision === "rejected" ? "rejected" : req.body?.decision === "checked" ? "checked" : "";
    if (!decision) return sendError(res, 400, "Mark it Checked or Rejected.");
    const note = String(req.body?.note || "").trim();
    if (note.length < 3) return sendError(res, 400, "Add a short note.");
    db.prepare("UPDATE contractor_documents SET owner_check = ?, owner_note = ? WHERE id = ?").run(decision, note, doc.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.document_reviewed", subjectType: "document", subjectId: doc.id, detail: { decision, note } });
    res.json({ decision, note, badge: "Owner " + decision, selfDeclared: "Documents checked (self-declared)" });
  });

  app.get("/api/owner/places", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const rows = db.prepare(`SELECT places.id, places.name, places.active, buildings.name AS building_name FROM places
      JOIN buildings ON buildings.id = places.building_id ORDER BY buildings.name, places.name`).all();
    res.json({ places: rows.map(row => ({ id: row.id, name: row.name, active: !!row.active, buildingName: row.building_name })) });
  });

  app.post("/api/owner/places/:id/active", requireJson, requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const place = db.prepare("SELECT id FROM places WHERE id = ?").get(req.params.id);
    if (!place) return sendError(res, 404, "That code was not found.");
    const active = !!req.body?.active;
    db.prepare("UPDATE places SET active = ? WHERE id = ?").run(active ? 1 : 0, place.id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: active ? "owner.qr_enabled" : "owner.qr_disabled", subjectType: "place", subjectId: place.id, detail: {} });
    res.json({ active });
  });

  app.get("/api/owner/ai", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const month = monthKey();
    const settings = moneySettings(db);
    const rows = db.prepare(`SELECT users.id, users.name, users.email, users.role, COALESCE(SUM(ai_uses.cost_cents), 0) AS spent_cents
      FROM users LEFT JOIN ai_uses ON ai_uses.user_id = users.id AND ai_uses.month = ? AND ai_uses.demo = 0
      WHERE users.role IN ('building_manager', 'oc_manager', 'property_manager', 'contractor')
      GROUP BY users.id
      ORDER BY spent_cents DESC, users.name`).all(month);
    const shape = (row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      spentCents: row.spent_cents,
      capCents: row.role === "contractor" ? settings.contractorAiCapCents : settings.aiCapCents
    });
    const feedbackTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_feedback'").get();
    const feedback = feedbackTable
      ? db.prepare("SELECT SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS down, SUM(CASE WHEN correction != '' THEN 1 ELSE 0 END) AS corrections FROM ai_feedback").get()
      : { up: 0, down: 0, corrections: 0 };
    res.json({
      available: true,
      month,
      feedback: { up: feedback.up || 0, down: feedback.down || 0, corrections: feedback.corrections || 0 },
      capCents: settings.aiCapCents,
      managerCapCents: settings.aiCapCents,
      contractorCapCents: settings.contractorAiCapCents,
      ownerUncapped: true,
      managers: rows.filter(row => row.role !== "contractor").map(shape),
      contractors: rows.filter(row => row.role === "contractor").map(shape)
    });
  });

  app.get("/api/owner/holidays", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const rows = db.prepare("SELECT day, name, note FROM public_holidays WHERE region_id = 'AU-VIC' ORDER BY day").all();
    res.json({ holidays: rows });
  });

  app.post("/api/owner/reminders/run", requireJson, requireUser, async (req, res) => {
    if (!guard(req, res)) return;
    const today = String(req.body?.today || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return sendError(res, 400, "Give the day to check, as YYYY-MM-DD.");
    const sent = await sendDueAlerts(db, mail, today);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.reminders_run", subjectType: "documents", subjectId: today, detail: { sent } });
    res.json({ sent });
  });

  app.get("/api/owner/audit", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const q = String(req.query.q || "").trim().toLowerCase();
    let rows = db.prepare("SELECT at, actor_id, action, subject_type, subject_id, detail FROM audit_events ORDER BY at DESC LIMIT 200").all();
    if (q) rows = rows.filter(row => (row.action + " " + (row.detail || "") + " " + (row.subject_id || "")).toLowerCase().includes(q));
    res.json({ events: rows });
  });

  app.get("/api/owner/audit.csv", requireUser, (req, res) => {
    if (!guard(req, res)) return;
    const rows = db.prepare("SELECT at, actor_id, action, subject_type, subject_id, detail FROM audit_events ORDER BY at DESC LIMIT 1000").all();
    const lines = ["at,actor_id,action,subject_type,subject_id,detail"];
    for (const row of rows) {
      lines.push([row.at, row.actor_id, row.action, row.subject_type, row.subject_id, row.detail].map(csvCell).join(","));
    }
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.audit_exported", subjectType: "audit", subjectId: "csv", detail: { rows: rows.length } });
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.send(lines.join("\n"));
  });
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}
