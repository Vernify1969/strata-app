import { audit } from "./db.js";
import { cleanAssistantName } from "./chloe.js";
import { abnOk, mobileOk, newId } from "./ids.js";
import { cleanDesignTheme, moneySettings } from "./payments.js";
import { readObject } from "./storage.js";

const USER_FIELDS = "id, organisation_id, email, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at, suspended, suspended_reason, stripe_account_id";
const MANAGER_ROLES = new Set(["building_manager", "oc_manager", "property_manager"]);
const JOB_STAGES = new Set(["open", "approved", "paid", "review0", "review1", "accepted", "released", "cancelled"]);

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

function pageQuery(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  return { page, pageSize, q: String(query.q || "").trim().toLowerCase(), sort: String(query.sort || ""), dir: query.dir === "asc" ? 1 : -1 };
}

function slicePage(rows, query, sortKey) {
  const { page, pageSize, q, sort, dir } = pageQuery(query);
  let list = rows;
  if (q) list = list.filter(row => JSON.stringify(row).toLowerCase().includes(q));
  const key = sort || sortKey;
  if (key) {
    list = [...list].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { numeric: true }) * dir);
  }
  const start = (page - 1) * pageSize;
  return { rows: list.slice(start, start + pageSize), total: list.length, page, pageSize };
}

function csv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map(column => `"${String(row[column] ?? "").replaceAll('"', '""')}"`).join(","));
  }
  return lines.join("\n");
}

function reasonOf(req, res, sendError) {
  if (req.body?.confirm !== true) {
    sendError(res, 400, "Confirm this change.");
    return "";
  }
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) {
    sendError(res, 400, "Add a short reason.");
    return "";
  }
  return reason;
}

export function registerAdminRoutes(app, { db, mail, config, sendError, requireJson, sendToken, sessionUser }) {
  function owner(req, res) {
    const user = sessionUser(req);
    if (!user) {
      sendError(res, 401, "Sign in to continue.");
      return null;
    }
    if (user.role !== "platform_owner") {
      sendError(res, 403, "Only the platform owner can open the admin console.");
      return null;
    }
    req.user = user;
    return user;
  }

  function record(user, action, subjectType, subjectId, before, after, reason) {
    audit(db, {
      actorId: user.id,
      organisationId: user.organisation_id,
      action,
      subjectType,
      subjectId,
      detail: { reason, before, after }
    });
  }

  app.get("/api/admin/dashboard", (req, res) => {
    if (!owner(req, res)) return;
    const count = (sql, ...args) => db.prepare(sql).get(...args).n;
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(new Date());
    const jobs = db.prepare("SELECT stage, COUNT(*) AS n FROM jobs GROUP BY stage").all();
    const signups = db.prepare("SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM users GROUP BY substr(created_at, 1, 7) ORDER BY month").all();
    const settings = moneySettings(db);
    res.json({
      managers: count("SELECT COUNT(*) AS n FROM users WHERE role IN ('building_manager', 'oc_manager', 'property_manager')"),
      contractors: count("SELECT COUNT(*) AS n FROM users WHERE role = 'contractor'"),
      buildings: count("SELECT COUNT(*) AS n FROM buildings WHERE archived = 0"),
      openJobs: count("SELECT COUNT(*) AS n FROM jobs WHERE stage = 'open'"),
      openReports: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'NEW'"),
      documentsExpiring: count("SELECT COUNT(*) AS n FROM contractor_documents WHERE expiry_on != '' AND expiry_on <= date('now', '+30 day')"),
      moneyHeldCents: count("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE status = 'succeeded' AND released_at = ''"),
      moneyReleasedCents: count("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE released_at != ''"),
      feesEarnedCents: count("SELECT COALESCE(SUM(fee_cents), 0) AS n FROM payments WHERE status = 'succeeded'"),
      newSignups: count("SELECT COUNT(*) AS n FROM users WHERE substr(created_at, 1, 7) = ?", month),
      aiSpentCents: count("SELECT COALESCE(SUM(cost_cents), 0) AS n FROM ai_uses WHERE month = ? AND demo = 0", month),
      jobsByStage: jobs,
      signups,
      attention: attentionList(db),
      caps: { managers: settings.aiCapCents, contractors: settings.contractorAiCapCents, owner: null },
      refunds: "rules not decided yet"
    });
  });

  app.get("/api/admin/search", (req, res) => {
    if (!owner(req, res)) return;
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json({ users: [], buildings: [], jobs: [], mail: [] });
    const like = `%${q}%`;
    res.json({
      users: db.prepare(`SELECT id, name, email, role FROM users WHERE lower(name) LIKE ? OR lower(email) LIKE ? OR lower(business_name) LIKE ? LIMIT 8`).all(like, like, like).map(safeUser),
      buildings: db.prepare("SELECT id, name, suburb FROM buildings WHERE lower(name) LIKE ? OR lower(suburb) LIKE ? LIMIT 8").all(like, like),
      jobs: db.prepare("SELECT id, title, stage FROM jobs WHERE lower(title) LIKE ? LIMIT 8").all(like),
      mail: db.prepare("SELECT id, to_email, subject, created_at FROM mail_log WHERE lower(to_email) LIKE ? OR lower(subject) LIKE ? OR lower(body) LIKE ? LIMIT 8").all(like, like, like)
    });
  });

  app.get("/api/admin/users.csv", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC`).all().map(safeUser);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.send(csv(rows, ["id", "name", "email", "role", "businessName", "suspended"]));
  });

  app.get("/api/admin/users", (req, res) => {
    if (!owner(req, res)) return;
    let rows = db.prepare(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC`).all().map(safeUser);
    if (req.query.role) rows = rows.filter(row => row.role === String(req.query.role));
    res.json(slicePage(rows, req.query, "name"));
  });

  app.get("/api/admin/users/:id", (req, res) => {
    if (!owner(req, res)) return;
    const row = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    const strikes = db.prepare("SELECT id, reason, created_at FROM contractor_strikes WHERE user_id = ? ORDER BY created_at DESC").all(row.id);
    const notes = db.prepare("SELECT id, body, created_at FROM admin_notes WHERE subject_type = 'user' AND subject_id = ? ORDER BY created_at DESC").all(row.id);
    const organisation = db.prepare("SELECT id, name, world FROM organisations WHERE id = ?").get(row.organisation_id);
    const body = { user: safeUser(row), strikes, notes, organisation };
    res.json(body);
  });

  app.patch("/api/admin/users/:id", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    const name = req.body.name == null ? row.name : String(req.body.name).trim();
    const mobile = req.body.mobile == null ? row.mobile : String(req.body.mobile).trim();
    const businessName = req.body.businessName == null ? row.business_name : String(req.body.businessName).trim();
    const abn = req.body.abn == null ? row.abn : String(req.body.abn).replace(/\s/g, "");
    let role = req.body.role == null ? row.role : String(req.body.role);
    if (name.length < 2) return sendError(res, 400, "Add the person's name.");
    if (mobile && !mobileOk(mobile)) return sendError(res, 400, "That mobile number is not an Australian mobile.");
    if (abn && !abnOk(abn)) return sendError(res, 400, "That ABN is not valid.");
    if (row.role === "platform_owner" || role === "platform_owner") role = row.role;
    if (row.role === "contractor") role = "contractor";
    if (MANAGER_ROLES.has(row.role) && !MANAGER_ROLES.has(role)) role = row.role;
    const before = safeUser(row);
    db.prepare("UPDATE users SET name = ?, mobile = ?, business_name = ?, abn = ?, role = ? WHERE id = ?").run(name, mobile, businessName, abn, role, row.id);
    const after = safeUser(db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(row.id));
    record(actor, "admin.user_edited", "user", row.id, before, after, reason);
    res.json({ user: after });
  });

  app.post("/api/admin/users/:id/suspend", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare("SELECT id, suspended FROM users WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    if (row.id === actor.id) return sendError(res, 400, "You cannot suspend your own account.");
    const suspended = req.body.suspended !== false;
    db.prepare("UPDATE users SET suspended = ?, suspended_reason = ? WHERE id = ?").run(suspended ? 1 : 0, reason, row.id);
    if (suspended) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
    record(actor, suspended ? "admin.user_suspended" : "admin.user_reactivated", "user", row.id, { suspended: !!row.suspended }, { suspended }, reason);
    res.json({ suspended, reason });
  });

  app.post("/api/admin/users/:id/strikes", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare("SELECT id, role FROM users WHERE id = ?").get(req.params.id);
    if (!row || row.role !== "contractor") return sendError(res, 404, "That contractor was not found.");
    const id = newId();
    db.prepare("INSERT INTO contractor_strikes (id, user_id, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?)").run(id, row.id, reason, actor.id, new Date().toISOString());
    record(actor, "admin.strike_noted", "user", row.id, {}, { reason }, reason);
    res.status(201).json({ id, reason });
  });

  app.post("/api/admin/users/:id/notes", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    const body = String(req.body.body || req.body.note || "").trim();
    if (body.length < 3) return sendError(res, 400, "Write the note.");
    const id = newId();
    db.prepare("INSERT INTO admin_notes (id, subject_type, subject_id, body, actor_id, created_at) VALUES (?, 'user', ?, ?, ?, ?)").run(id, row.id, body, actor.id, new Date().toISOString());
    record(actor, "admin.note_added", "user", row.id, {}, { body }, reason);
    res.status(201).json({ id, body });
  });

  app.post("/api/admin/users/:id/send-reset", requireJson, async (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That account was not found.");
    await sendToken(row, "reset");
    record(actor, "admin.password_reset_sent", "user", row.id, {}, { email: row.email }, reason);
    res.json({ ok: true, message: "A password reset email was sent." });
  });

  app.post("/api/admin/users/:id/view-as", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(req.params.id);
    if (!row || row.role === "platform_owner") return sendError(res, 404, "That account cannot be viewed this way.");
    const bits = [`strata_view=${encodeURIComponent(row.id)}`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=3600"];
    if (config.cookieSecure) bits.push("Secure");
    res.setHeader("Set-Cookie", bits.join("; "));
    record(actor, "admin.view_as", "user", row.id, {}, { name: row.name, role: row.role }, reason);
    res.json({ viewing: safeUser(row), banner: `Viewing as ${row.name}. This view cannot change anything.` });
  });

  app.post("/api/admin/view-as/stop", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const bits = ["strata_view=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
    if (config.cookieSecure) bits.push("Secure");
    res.setHeader("Set-Cookie", bits.join("; "));
    record(actor, "admin.view_as_stopped", "user", actor.id, {}, {}, "Stopped the read-only view.");
    res.json({ ok: true });
  });

  app.get("/api/admin/organisations", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT id, name, world, created_at FROM organisations ORDER BY name").all();
    res.json(slicePage(rows, req.query, "name"));
  });

  app.get("/api/admin/organisations/:id", (req, res) => {
    if (!owner(req, res)) return;
    const organisation = db.prepare("SELECT id, name, world, created_at FROM organisations WHERE id = ?").get(req.params.id);
    if (!organisation) return sendError(res, 404, "That organisation was not found.");
    const people = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE organisation_id = ?`).all(organisation.id).map(safeUser);
    const buildings = db.prepare("SELECT id, name, suburb, world, region_id FROM buildings WHERE organisation_id = ?").all(organisation.id);
    res.json({ organisation, people, buildings });
  });

  app.get("/api/admin/buildings", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT id, name, suburb, postcode, world, region_id, organisation_id, archived, tiers_confirmed FROM buildings ORDER BY name").all();
    res.json(slicePage(rows, req.query, "name"));
  });

  app.get("/api/admin/buildings/:id", (req, res) => {
    if (!owner(req, res)) return;
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(req.params.id);
    if (!building) return sendError(res, 404, "That building was not found.");
    const managers = db.prepare(`SELECT ${USER_FIELDS} FROM users JOIN building_assignments ON building_assignments.user_id = users.id WHERE building_assignments.building_id = ?`).all(building.id).map(safeUser);
    const places = db.prepare("SELECT id, name, level, kind, active FROM places WHERE building_id = ?").all(building.id);
    res.json({
      building: {
        id: building.id,
        name: building.name,
        suburb: building.suburb,
        postcode: building.postcode,
        world: building.world,
        regionId: building.region_id,
        tier1Cents: building.tier1_cents,
        tier2Cents: building.tier2_cents,
        tier3Cents: building.tier3_cents,
        q1: building.tier1_quotes,
        q2: building.tier2_quotes,
        q3: building.tier3_quotes,
        tiersConfirmed: !!building.tiers_confirmed
      },
      managers,
      places
    });
  });

  app.patch("/api/admin/buildings/:id", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(req.params.id);
    if (!building) return sendError(res, 404, "That building was not found.");
    const name = req.body.name == null ? building.name : String(req.body.name).trim();
    const regionId = req.body.regionId == null ? building.region_id : String(req.body.regionId);
    if (!db.prepare("SELECT id FROM regions WHERE id = ?").get(regionId)) return sendError(res, 400, "That region is not available.");
    const tier = (key, current) => req.body[key] == null ? current : Number(req.body[key]);
    const before = { name: building.name, regionId: building.region_id, tier1Cents: building.tier1_cents };
    db.prepare(`UPDATE buildings SET name = ?, region_id = ?, tier1_cents = ?, tier2_cents = ?, tier3_cents = ?, tier1_quotes = ?, tier2_quotes = ?, tier3_quotes = ?, tiers_confirmed = ? WHERE id = ?`).run(
      name, regionId,
      tier("tier1Cents", building.tier1_cents), tier("tier2Cents", building.tier2_cents), tier("tier3Cents", building.tier3_cents),
      tier("q1", building.tier1_quotes), tier("q2", building.tier2_quotes), tier("q3", building.tier3_quotes),
      req.body.tiersConfirmed == null ? building.tiers_confirmed : (req.body.tiersConfirmed ? 1 : 0),
      building.id
    );
    const after = db.prepare("SELECT name, region_id AS regionId, tier1_cents AS tier1Cents FROM buildings WHERE id = ?").get(building.id);
    record(actor, "admin.building_edited", "building", building.id, before, after, reason);
    res.json({ building: after });
  });

  app.post("/api/admin/buildings/:id/managers", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const building = db.prepare("SELECT id, organisation_id FROM buildings WHERE id = ?").get(req.params.id);
    const person = db.prepare("SELECT id, organisation_id, role FROM users WHERE id = ?").get(String(req.body.userId || ""));
    if (!building || !person || person.organisation_id !== building.organisation_id || !MANAGER_ROLES.has(person.role)) {
      return sendError(res, 404, "That manager is not in this building's organisation.");
    }
    const assigned = !!db.prepare("SELECT 1 AS ok FROM building_assignments WHERE user_id = ? AND building_id = ?").get(person.id, building.id);
    if (req.body.assign === false) {
      db.prepare("DELETE FROM building_assignments WHERE user_id = ? AND building_id = ?").run(person.id, building.id);
    } else if (!assigned) {
      db.prepare("INSERT INTO building_assignments (user_id, building_id) VALUES (?, ?)").run(person.id, building.id);
    }
    record(actor, "admin.building_managers", "building", building.id, { assigned }, { assign: req.body.assign !== false, userId: person.id }, reason);
    res.json({ assign: req.body.assign !== false });
  });

  app.post("/api/admin/places/:id/active", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const place = db.prepare("SELECT id, active FROM places WHERE id = ?").get(req.params.id);
    if (!place) return sendError(res, 404, "That code was not found.");
    const active = !!req.body.active;
    db.prepare("UPDATE places SET active = ? WHERE id = ?").run(active ? 1 : 0, place.id);
    record(actor, active ? "admin.qr_enabled" : "admin.qr_disabled", "place", place.id, { active: !!place.active }, { active }, reason);
    res.json({ active });
  });

  app.get("/api/admin/jobs.csv", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT id, title, stage, building_id, created_at FROM jobs ORDER BY created_at DESC").all();
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.send(csv(rows, ["id", "title", "stage", "building_id", "created_at"]));
  });

  app.get("/api/admin/jobs", (req, res) => {
    if (!owner(req, res)) return;
    let rows = db.prepare("SELECT id, title, stage, building_id, organisation_id, created_at FROM jobs ORDER BY created_at DESC").all();
    if (req.query.status) rows = rows.filter(row => row.stage === String(req.query.status));
    if (req.query.buildingId) rows = rows.filter(row => row.building_id === String(req.query.buildingId));
    res.json(slicePage(rows, req.query, "created_at"));
  });

  app.get("/api/admin/jobs/:id", (req, res) => {
    if (!owner(req, res)) return;
    const job = db.prepare("SELECT id, title, stage, area, instructions, building_id, contractor_user_id, payload, created_at FROM jobs WHERE id = ?").get(req.params.id);
    if (!job) return sendError(res, 404, "That job was not found.");
    const timeline = db.prepare("SELECT at, actor_name, body FROM job_events WHERE job_id = ? ORDER BY id").all(job.id);
    const quotes = db.prepare("SELECT id, price_cents, status, deposit_type, scope, contractor_user_id, created_at FROM quotes WHERE job_id = ?").all(job.id);
    const photos = db.prepare("SELECT report_photos.id, report_photos.stored_name FROM report_photos JOIN reports ON reports.id = report_photos.report_id WHERE reports.job_id = ?").all(job.id);
    res.json({ job, timeline, quotes, photos, documents: [] });
  });

  app.post("/api/admin/jobs/:id/status", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const job = db.prepare("SELECT id, stage FROM jobs WHERE id = ?").get(req.params.id);
    if (!job) return sendError(res, 404, "That job was not found.");
    const stage = String(req.body.stage || "");
    if (!JOB_STAGES.has(stage)) return sendError(res, 400, "That status is not available.");
    db.prepare("UPDATE jobs SET stage = ? WHERE id = ?").run(stage, job.id);
    db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(job.id, new Date().toISOString(), actor.name, `Status set to ${stage}. ${reason}`);
    record(actor, "admin.job_status", "job", job.id, { stage: job.stage }, { stage }, reason);
    res.json({ stage });
  });

  app.post("/api/admin/jobs/:id/reassign", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const job = db.prepare("SELECT id, contractor_user_id FROM jobs WHERE id = ?").get(req.params.id);
    const person = db.prepare("SELECT id, role, name FROM users WHERE id = ?").get(String(req.body.contractorUserId || ""));
    if (!job || !person || person.role !== "contractor") return sendError(res, 404, "Choose a contractor on this job.");
    db.prepare("UPDATE jobs SET contractor_user_id = ? WHERE id = ?").run(person.id, job.id);
    record(actor, "admin.job_reassigned", "job", job.id, { contractorUserId: job.contractor_user_id }, { contractorUserId: person.id }, reason);
    res.json({ contractorUserId: person.id });
  });

  app.post("/api/admin/jobs/:id/cancel", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const job = db.prepare("SELECT id, stage FROM jobs WHERE id = ?").get(req.params.id);
    if (!job) return sendError(res, 404, "That job was not found.");
    db.prepare("UPDATE jobs SET stage = 'cancelled' WHERE id = ?").run(job.id);
    db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(job.id, new Date().toISOString(), actor.name, `Cancelled. ${reason}`);
    record(actor, "admin.job_cancelled", "job", job.id, { stage: job.stage }, { stage: "cancelled" }, reason);
    res.json({ stage: "cancelled" });
  });

  app.get("/api/admin/payments.csv", (req, res) => {
    if (!owner(req, res)) return;
    const rows = paymentRows(db);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.send(csv(rows, ["id", "ledger", "amount_cents", "fee_cents", "status", "provider_ref"]));
  });

  app.get("/api/admin/payments", (req, res) => {
    if (!owner(req, res)) return;
    let rows = paymentRows(db);
    if (req.query.status) rows = rows.filter(row => row.ledger === String(req.query.status) || row.status === String(req.query.status));
    res.json({ ...slicePage(rows, req.query, "created_at"), refunds: "rules not decided yet" });
  });

  app.get("/api/admin/payments/:id", (req, res) => {
    if (!owner(req, res)) return;
    const row = paymentRows(db).find(item => item.id === req.params.id);
    if (!row) return sendError(res, 404, "That payment was not found.");
    res.json({ payment: row, refunds: "rules not decided yet", invoice: `Invoice ${row.id}` });
  });

  app.post("/api/admin/payments/:id/pause", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const payment = db.prepare("SELECT id, released_at, payout_paused FROM payments WHERE id = ?").get(req.params.id);
    if (!payment) return sendError(res, 404, "That payment was not found.");
    if (payment.released_at) return sendError(res, 400, "That payout has already been released.");
    const paused = req.body.paused !== false;
    db.prepare("UPDATE payments SET payout_paused = ?, payout_pause_reason = ? WHERE id = ?").run(paused ? 1 : 0, reason, payment.id);
    record(actor, paused ? "admin.payout_paused" : "admin.payout_resumed", "payment", payment.id, { paused: !!payment.payout_paused }, { paused }, reason);
    res.json({ paused, reason });
  });

  app.get("/api/admin/mail", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT id, to_email, subject, body, status, error, created_at FROM mail_log ORDER BY created_at DESC").all();
    res.json(slicePage(rows, req.query, "created_at"));
  });

  app.post("/api/admin/mail/:id/resend", requireJson, async (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare("SELECT * FROM mail_log WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That email was not found.");
    await mail.send({ to: row.to_email, subject: row.subject, text: row.body });
    record(actor, "admin.mail_resent", "mail", row.id, {}, { to: row.to_email }, reason);
    res.json({ ok: true });
  });

  app.get("/api/admin/messages", (req, res) => {
    if (!owner(req, res)) return;
    const jobs = db.prepare(`SELECT job_messages.id, job_messages.body, job_messages.created_at, jobs.title, users.name AS author
      FROM job_messages JOIN jobs ON jobs.id = job_messages.job_id JOIN users ON users.id = job_messages.author_user_id
      ORDER BY job_messages.created_at DESC`).all();
    const reports = db.prepare("SELECT id, report_id, at AS created_at, actor AS author, body FROM report_events ORDER BY id DESC").all();
    res.json(slicePage([...jobs, ...reports], req.query, "created_at"));
  });

  app.get("/api/admin/drafts", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT id, to_email, subject, body, status, created_at, sent_at FROM email_drafts ORDER BY created_at DESC").all();
    res.json({ rows });
  });

  app.post("/api/admin/drafts", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const person = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(String(req.body.userId || ""));
    const subject = String(req.body.subject || "").trim();
    const body = String(req.body.body || "").trim();
    if (!person) return sendError(res, 404, "That account was not found.");
    if (subject.length < 2 || body.length < 2) return sendError(res, 400, "Add a subject and a message.");
    const id = newId();
    db.prepare("INSERT INTO email_drafts (id, to_user_id, to_email, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, 'draft', ?)").run(id, person.id, person.email, subject, body, new Date().toISOString());
    record(actor, "admin.draft_saved", "mail", id, {}, { to: person.email, subject }, "Saved a draft.");
    res.status(201).json({ id, status: "draft" });
  });

  app.post("/api/admin/drafts/:id/send", requireJson, async (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const draft = db.prepare("SELECT * FROM email_drafts WHERE id = ?").get(req.params.id);
    if (!draft || draft.status === "sent") return sendError(res, 404, "That draft is not waiting to be sent.");
    await mail.send({ to: draft.to_email, subject: draft.subject, text: draft.body });
    const sentAt = new Date().toISOString();
    db.prepare("UPDATE email_drafts SET status = 'sent', sent_at = ? WHERE id = ?").run(sentAt, draft.id);
    record(actor, "admin.draft_sent", "mail", draft.id, { status: "draft" }, { status: "sent" }, reason);
    res.json({ status: "sent" });
  });

  app.get("/api/admin/reports", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare(`SELECT reports.id, reports.reference, reports.status, reports.kind, reports.description, reports.created_at, buildings.name AS building_name, places.name AS place_name
      FROM reports JOIN buildings ON buildings.id = reports.building_id JOIN places ON places.id = reports.place_id
      ORDER BY reports.created_at DESC`).all();
    res.json(slicePage(rows, req.query, "created_at"));
  });

  app.get("/api/admin/documents", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare(`SELECT contractor_documents.id, contractor_documents.kind, contractor_documents.expiry_on, contractor_documents.licence_number, contractor_documents.suggested_expiry, contractor_documents.suggested_number, contractor_documents.owner_check, contractor_documents.owner_note, contractor_documents.original_name, users.name AS contractor_name
      FROM contractor_documents JOIN users ON users.id = contractor_documents.user_id ORDER BY contractor_documents.created_at DESC`).all();
    res.json({ rows: rows.map(row => ({ ...row, badge: row.owner_check ? "Owner " + row.owner_check : "Documents checked (self-declared)" })) });
  });

  app.get("/api/admin/documents/:id/file", async (req, res) => {
    if (!owner(req, res)) return;
    const row = db.prepare("SELECT * FROM contractor_documents WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That document was not found.");
    const bytes = await readObject(config, "document", row.stored_name);
    if (!bytes) return sendError(res, 404, "That file is not stored.");
    res.setHeader("content-type", row.mime || "application/octet-stream");
    res.send(bytes);
  });

  app.post("/api/admin/documents/:id/review", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const doc = db.prepare("SELECT id, owner_check FROM contractor_documents WHERE id = ?").get(req.params.id);
    if (!doc) return sendError(res, 404, "That document was not found.");
    const decision = req.body.decision === "rejected" ? "rejected" : req.body.decision === "checked" ? "checked" : "";
    if (!decision) return sendError(res, 400, "Mark it Checked or Rejected.");
    db.prepare("UPDATE contractor_documents SET owner_check = ?, owner_note = ? WHERE id = ?").run(decision, reason, doc.id);
    record(actor, "admin.document_reviewed", "document", doc.id, { ownerCheck: doc.owner_check }, { ownerCheck: decision }, reason);
    res.json({ decision, badge: "Owner " + decision, selfDeclared: "Documents checked (self-declared)" });
  });

  app.get("/api/admin/ai", (req, res) => {
    if (!owner(req, res)) return;
    const settings = moneySettings(db);
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(new Date());
    const people = db.prepare(`SELECT users.id, users.name, users.email, users.role, COALESCE(SUM(CASE WHEN ai_uses.demo = 0 THEN ai_uses.cost_cents ELSE 0 END), 0) AS spent_cents
      FROM users LEFT JOIN ai_uses ON ai_uses.user_id = users.id AND ai_uses.month = ?
      WHERE users.role != 'platform_owner'
      GROUP BY users.id ORDER BY spent_cents DESC`).all(month);
    const logs = db.prepare("SELECT id, user_id, helper, model, demo, cost_cents, created_at FROM ai_uses ORDER BY created_at DESC LIMIT 100").all();
    res.json({
      feedback: feedbackStats(db),
      month,
      managerCapCents: settings.aiCapCents,
      contractorCapCents: settings.contractorAiCapCents,
      ownerUncapped: true,
      people: people.map(row => ({ ...row, capCents: row.role === "contractor" ? settings.contractorAiCapCents : settings.aiCapCents })),
      logs
    });
  });

  app.get("/api/admin/settings", (req, res) => {
    if (!owner(req, res)) return;
    const settings = moneySettings(db);
    res.json({
      ...settings,
      ownerUncapped: true,
      holidays: db.prepare("SELECT day, name, note FROM public_holidays WHERE region_id = 'AU-VIC' ORDER BY day").all(),
      postcodes: db.prepare("SELECT postcode FROM service_postcodes ORDER BY postcode").all().map(row => row.postcode),
      templates: db.prepare("SELECT id, name, subject, body, updated_at FROM email_templates ORDER BY name").all(),
      reminders: { checkHours: settings.reminderCheckHours, documentDays: [30, 7, 0] }
    });
  });

  app.patch("/api/admin/settings", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const current = moneySettings(db);
    const next = {
      commission: num(req.body.commissionPercent, current.commissionPercent),
      urgent: num(req.body.urgentFeeCents, current.urgentFeeCents),
      depositHours: num(req.body.depositHours, current.depositHours),
      urgentDepositHours: num(req.body.urgentDepositHours, current.urgentDepositHours),
      aiCapCents: num(req.body.aiCapCents, current.aiCapCents),
      contractorAiCapCents: num(req.body.contractorAiCapCents, current.contractorAiCapCents),
      reminderCheckHours: num(req.body.reminderCheckHours, current.reminderCheckHours),
      assistantName: req.body.assistantName == null ? current.assistantName : cleanAssistantName(req.body.assistantName),
      assistantGreeting: req.body.assistantGreeting == null ? current.assistantGreeting : String(req.body.assistantGreeting).slice(0, 180),
      assistantTone: req.body.assistantTone == null ? current.assistantTone : (req.body.assistantTone === "short" ? "short" : "friendly"),
      designTheme: cleanDesignTheme(req.body.designTheme, current.designTheme)
    };
    if (req.body.assistantName != null && !next.assistantName) return sendError(res, 400, "The assistant name is 1 to 20 letters and spaces.");
    if (next.depositHours < 1 || next.depositHours > 168 || next.reminderCheckHours < 1 || next.reminderCheckHours > 168) {
      return sendError(res, 400, "Hours are a whole number from 1 to 168.");
    }
    db.prepare(`UPDATE platform_settings SET commission_percent = ?, urgent_fee_cents = ?, deposit_hours = ?, urgent_deposit_hours = ?, ai_cap_cents = ?, contractor_ai_cap_cents = ?, reminder_check_hours = ?, assistant_name = ?, assistant_greeting = ?, assistant_tone = ?, design_theme = ? WHERE id = 'main'`).run(
      next.commission, next.urgent, next.depositHours, next.urgentDepositHours, next.aiCapCents, next.contractorAiCapCents, next.reminderCheckHours, next.assistantName, next.assistantGreeting, next.assistantTone, next.designTheme
    );
    record(actor, "admin.settings_edited", "settings", "main", { aiCapCents: current.aiCapCents, reminderCheckHours: current.reminderCheckHours }, next, reason);
    res.json(moneySettings(db));
  });

  app.post("/api/admin/web-search", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const before = moneySettings(db).webSearchEnabled;
    const enabled = req.body?.enabled === true;
    db.prepare("UPDATE platform_settings SET web_search_enabled = ? WHERE id = 'main'").run(enabled ? 1 : 0);
    record(actor, enabled ? "admin.web_search_on" : "admin.web_search_emergency_off", "settings", "web-search", { enabled: before }, { enabled }, reason);
    res.json({ webSearchEnabled: enabled, emergency: !enabled });
  });

  app.patch("/api/admin/templates/:id", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const row = db.prepare("SELECT * FROM email_templates WHERE id = ?").get(req.params.id);
    if (!row) return sendError(res, 404, "That template was not found.");
    const subject = String(req.body.subject || "").trim();
    const body = String(req.body.body || "").trim();
    if (subject.length < 2 || body.length < 2) return sendError(res, 400, "Add a subject and a body.");
    db.prepare("UPDATE email_templates SET subject = ?, body = ?, updated_at = ? WHERE id = ?").run(subject, body, new Date().toISOString(), row.id);
    record(actor, "admin.template_edited", "template", row.id, { subject: row.subject }, { subject }, reason);
    res.json({ id: row.id, subject });
  });

  app.get("/api/admin/postcodes", (req, res) => {
    if (!owner(req, res)) return;
    res.json({ postcodes: db.prepare("SELECT postcode FROM service_postcodes ORDER BY postcode").all().map(row => row.postcode) });
  });

  app.post("/api/admin/postcodes", requireJson, (req, res) => {
    const actor = owner(req, res);
    if (!actor) return;
    const reason = reasonOf(req, res, sendError);
    if (!reason) return;
    const postcode = String(req.body.postcode || "");
    if (!/^\d{4}$/.test(postcode)) return sendError(res, 400, "A postcode is four digits.");
    db.prepare("INSERT INTO service_postcodes (postcode) VALUES (?) ON CONFLICT(postcode) DO NOTHING").run(postcode);
    record(actor, "admin.postcode_added", "postcode", postcode, {}, { postcode }, reason);
    res.status(201).json({ postcode });
  });

  app.get("/api/admin/audit.csv", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT at, actor_id, action, subject_type, subject_id, detail FROM audit_events ORDER BY at DESC LIMIT 1000").all();
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.send(csv(rows, ["at", "actor_id", "action", "subject_type", "subject_id", "detail"]));
  });

  app.get("/api/admin/audit", (req, res) => {
    if (!owner(req, res)) return;
    const rows = db.prepare("SELECT at, actor_id, action, subject_type, subject_id, detail FROM audit_events ORDER BY at DESC LIMIT 500").all();
    res.json(slicePage(rows, req.query, "at"));
  });
}

function num(value, fallback) {
  return value == null ? fallback : Number(value);
}

function feedbackStats(db) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_feedback'").get();
  if (!table) return { up: 0, down: 0, corrections: 0 };
  const row = db.prepare("SELECT SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS down, SUM(CASE WHEN correction != '' THEN 1 ELSE 0 END) AS corrections FROM ai_feedback").get();
  return { up: row.up || 0, down: row.down || 0, corrections: row.corrections || 0 };
}

function attentionList(db) {
  const items = [];
  const reports = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'NEW'").get().n;
  if (reports) items.push({ text: `${reports} resident report${reports === 1 ? "" : "s"} still open`, href: "#/reports" });
  const docs = db.prepare("SELECT COUNT(*) AS n FROM contractor_documents WHERE expiry_on != '' AND expiry_on <= date('now', '+30 day') AND owner_check = ''").get().n;
  if (docs) items.push({ text: `${docs} document${docs === 1 ? "" : "s"} close to expiry and not checked`, href: "#/documents" });
  const paused = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE payout_paused = 1 AND released_at = ''").get().n;
  if (paused) items.push({ text: `${paused} payout${paused === 1 ? "" : "s"} paused`, href: "#/payments" });
  return items;
}

function paymentRows(db) {
  return db.prepare("SELECT id, job_id, amount_cents, fee_cents, net_cents, status, released_at, payout_paused, payout_pause_reason, provider_ref, transfer_ref, holder, kind, created_at, authorize_expires_at, captured_at, capture_requested_at, funds_confirmed_at FROM payments ORDER BY created_at DESC").all().map(row => ({
    ...row,
    stripePaymentId: row.provider_ref,
    stripeTransferId: row.transfer_ref,
    ledger: row.released_at ? "released" : row.payout_paused ? "paused" : row.status === "succeeded" ? "held" : row.status === "requires_capture" ? "captured" : row.status,
    invoice: `Invoice ${row.id}`
  }));
}
