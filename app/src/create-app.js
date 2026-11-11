import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, audit } from "./db.js";
import { createMailer } from "./mail.js";
import { hashPassword, verifyPassword, passwordProblem, dummyPasswordHash } from "./passwords.js";
import {
  abnOk, clearSessionCookie, emailOk, hashToken, mobileOk, newId, newToken,
  normalEmail, publicUser, readCookie, sessionCookie
} from "./ids.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const ROLE_WORLD = {
  building_manager: "common",
  oc_manager: "common",
  property_manager: "private",
  contractor: "contractor",
  platform_owner: "platform"
};

export async function createApp(config) {
  const db = openDatabase(config.databasePath);
  const mail = createMailer(config);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  function sendError(res, status, error) {
    res.status(status).json({ error });
  }

  function userById(id) {
    return db.prepare(`SELECT users.*, organisations.world AS world, organisations.name AS organisation_name
      FROM users JOIN organisations ON organisations.id = users.organisation_id
      WHERE users.id = ?`).get(id);
  }

  function userByEmail(email) {
    return db.prepare(`SELECT users.*, organisations.world AS world, organisations.name AS organisation_name
      FROM users JOIN organisations ON organisations.id = users.organisation_id
      WHERE users.email = ?`).get(normalEmail(email));
  }

  function currentUser(req) {
    const token = readCookie(req, "strata_session");
    if (!token) return null;
    const row = db.prepare(`SELECT sessions.user_id, sessions.expires_at FROM sessions WHERE token_hash = ?`).get(hashToken(token));
    if (!row) return null;
    if (row.expires_at < new Date().toISOString()) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      return null;
    }
    const user = userById(row.user_id);
    if (!user || !user.email_verified_at) return null;
    return user;
  }

  function requireUser(req, res, next) {
    const user = currentUser(req);
    if (!user) return sendError(res, 401, "Sign in to continue.");
    req.user = user;
    next();
  }

  function requireJson(req, res, next) {
    const header = req.get("x-requested-with") || "";
    const type = req.get("content-type") || "";
    if (header !== "StrataApp" || !type.includes("application/json")) {
      return sendError(res, 400, "The request was not accepted.");
    }
    next();
  }

  function issueSession(res, user, keep) {
    const token = newToken();
    const hours = keep ? 24 * 30 : 12;
    const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(newId(), user.id, hashToken(token), expires, new Date().toISOString());
    res.setHeader("Set-Cookie", sessionCookie(token, { keep, secure: config.cookieSecure }));
  }

  async function sendToken(user, purpose) {
    const token = newToken();
    const hours = purpose === "verify" ? 24 : 1;
    const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)`).run(newId(), user.id, purpose, hashToken(token), expires, new Date().toISOString());
    const link = purpose === "verify"
      ? `${config.publicBaseUrl}/api/verify-email?token=${encodeURIComponent(token)}`
      : `${config.publicBaseUrl}/reset?token=${encodeURIComponent(token)}`;
    const subject = purpose === "verify" ? "Confirm your Strata App email" : "Reset your Strata App password";
    const text = purpose === "verify"
      ? `Confirm your email for Strata App by opening this link within 24 hours:\n${link}\n\nIf you did not create an account, ignore this email.`
      : `Reset your Strata App password by opening this link within 1 hour:\n${link}\n\nIf you did not ask for this, ignore this email.`;
    return mail.send({ to: user.email, subject, text });
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "strata-app" });
  });

  app.post("/api/register", requireJson, async (req, res) => {
    const body = req.body || {};
    const kind = body.kind === "contractor" ? "contractor" : body.kind === "manager" ? "manager" : "";
    if (!kind) return sendError(res, 400, "Choose manager or contractor.");
    let role = kind === "contractor" ? "contractor" : body.role;
    if (!ROLE_WORLD[role] || role === "platform_owner") return sendError(res, 400, "Choose a role. An account is one role.");
    const email = normalEmail(body.email);
    const name = String(body.name || "").trim();
    const mobile = String(body.mobile || "").trim();
    const business = String(body.businessName || "").trim();
    if (!name || name.length < 2) return sendError(res, 400, "Add your full name.");
    if (!emailOk(email)) return sendError(res, 400, "Add a valid email address.");
    if (!mobileOk(mobile)) return sendError(res, 400, "Add a mobile number.");
    if (kind === "contractor" && business.length < 2) return sendError(res, 400, "Add the business name.");
    if (!body.agree) return sendError(res, 400, "Agree to the terms and the privacy summary to create an account.");
    const passwordError = passwordProblem(body.password, email);
    if (passwordError) return sendError(res, 400, passwordError);
    if (body.password !== body.confirm) return sendError(res, 400, "The two passwords do not match.");
    if (userByEmail(email)) return sendError(res, 400, "An account with that email already exists.");
    const orgId = newId();
    const userId = newId();
    const now = new Date().toISOString();
    const orgName = business || name;
    const passwordHash = await hashPassword(body.password);
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, ?, ?, ?)").run(orgId, orgName, ROLE_WORLD[role], now);
      db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', 0, NULL, ?)`).run(userId, orgId, email, passwordHash, role, name, mobile, business, now);
      audit(db, { actorId: userId, organisationId: orgId, action: "account.registered", subjectType: "user", subjectId: userId, detail: { role } });
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    const delivery = await sendToken(userById(userId), "verify");
    res.status(201).json({
      ok: true,
      email,
      emailSent: delivery.sent,
      message: delivery.sent
        ? "Check your email and open the confirmation link, then sign in."
        : "The confirmation link is waiting in the server mailbox until an email service is connected. Open that link, then sign in."
    });
  });

  app.get("/api/verify-email", (req, res) => {
    const token = String(req.query.token || "");
    const row = db.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = 'verify'").get(hashToken(token));
    const fail = () => res.redirect(302, "/?verify=invalid");
    if (!row || row.used_at || row.expires_at < new Date().toISOString()) return fail();
    const now = new Date().toISOString();
    db.prepare("UPDATE email_tokens SET used_at = ? WHERE id = ?").run(now, row.id);
    db.prepare("UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL").run(now, row.user_id);
    const user = userById(row.user_id);
    audit(db, { actorId: user.id, organisationId: user.organisation_id, action: "account.email_verified", subjectType: "user", subjectId: user.id, detail: {} });
    res.redirect(302, "/?verified=1");
  });

  app.post("/api/resend-verification", requireJson, async (req, res) => {
    const email = normalEmail(req.body?.email);
    const user = emailOk(email) ? userByEmail(email) : null;
    if (user && !user.email_verified_at) await sendToken(user, "verify");
    res.json({ ok: true, message: "If that account is waiting to be confirmed, a new link is on its way." });
  });

  app.post("/api/login", requireJson, async (req, res) => {
    const email = normalEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const keep = req.body?.keep !== false;
    const same = "The email or password is not right.";
    const attempt = db.prepare("SELECT * FROM login_attempts WHERE email = ?").get(email) || { email, failures: 0, locked_until: null };
    if (attempt.locked_until && attempt.locked_until > new Date().toISOString()) {
      return sendError(res, 429, "That sign-in is paused for a minute. Try again then.");
    }
    const user = email ? userByEmail(email) : null;
    const hash = user ? user.password_hash : await dummyPasswordHash();
    const match = await verifyPassword(password, hash);
    if (!user || !match) {
      const failures = Number(attempt.failures || 0) + 1;
      const locked = failures >= 5 ? new Date(Date.now() + 60 * 1000).toISOString() : null;
      db.prepare(`INSERT INTO login_attempts (email, failures, locked_until) VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`)
        .run(email || "unknown", failures, locked);
      if (locked) return sendError(res, 429, "That sign-in is paused for a minute. Try again then.");
      return sendError(res, 401, same);
    }
    if (!user.email_verified_at) return sendError(res, 403, "Confirm your email first. You can ask for the link again.");
    db.prepare("DELETE FROM login_attempts WHERE email = ?").run(email);
    issueSession(res, user, keep);
    audit(db, { actorId: user.id, organisationId: user.organisation_id, action: "account.signed_in", subjectType: "user", subjectId: user.id, detail: {} });
    res.json({ user: publicUser(user) });
  });

  app.post("/api/logout", requireJson, (req, res) => {
    const token = readCookie(req, "strata_session");
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    res.setHeader("Set-Cookie", clearSessionCookie(config.cookieSecure));
    res.json({ ok: true });
  });

  app.post("/api/forgot-password", requireJson, async (req, res) => {
    const email = normalEmail(req.body?.email);
    const user = emailOk(email) ? userByEmail(email) : null;
    if (user && user.email_verified_at) await sendToken(user, "reset");
    res.json({ ok: true, message: "If an account uses that email, a reset link is on its way." });
  });

  app.post("/api/reset-password", requireJson, async (req, res) => {
    const token = String(req.body?.token || "");
    const row = db.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'").get(hashToken(token));
    if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
      return sendError(res, 400, "That reset link has expired. Ask for a new one.");
    }
    const user = userById(row.user_id);
    const problem = passwordProblem(req.body?.password, user.email);
    if (problem) return sendError(res, 400, problem);
    if (req.body?.password !== req.body?.confirm) return sendError(res, 400, "The two passwords do not match.");
    const passwordHash = await hashPassword(req.body.password);
    const now = new Date().toISOString();
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
    db.prepare("UPDATE email_tokens SET used_at = ? WHERE id = ?").run(now, row.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    audit(db, { actorId: user.id, organisationId: user.organisation_id, action: "account.password_reset", subjectType: "user", subjectId: user.id, detail: {} });
    res.json({ ok: true, message: "Password updated. Sign in with the new password. The old one no longer works." });
  });

  app.get("/api/me", requireUser, (req, res) => {
    res.json({
      user: publicUser(req.user),
      banner: bannerFor(req.user)
    });
  });

  app.patch("/api/me", requireJson, requireUser, async (req, res) => {
    const body = req.body || {};
    const user = req.user;
    if (body.role && body.role !== user.role) {
      const common = ["building_manager", "oc_manager"];
      if (!(common.includes(user.role) && common.includes(body.role))) {
        return sendError(res, 403, "An account keeps its role. Building manager and OC manager can switch with each other. A property manager or a contractor cannot.");
      }
    }
    const name = body.name != null ? String(body.name).trim() : user.name;
    const mobile = body.mobile != null ? String(body.mobile).trim() : user.mobile;
    const business = body.businessName != null ? String(body.businessName).trim() : user.business_name;
    const abn = body.abn != null ? String(body.abn).replace(/\s/g, "") : user.abn;
    const payment = body.payment != null ? String(body.payment) : user.payment_method;
    const consent = body.consent != null ? (body.consent ? 1 : 0) : user.consent;
    if (name.length < 2) return sendError(res, 400, "Add your full name.");
    if (mobile && !mobileOk(mobile)) return sendError(res, 400, "Add a mobile number.");
    if (abn && !abnOk(abn)) return sendError(res, 400, "That ABN does not pass the check digits. The register check is still to be connected.");
    if (payment && !["bank", "card"].includes(payment)) return sendError(res, 400, "Choose bank transfer or card.");
    const role = body.role && body.role !== user.role ? body.role : user.role;
    db.prepare(`UPDATE users SET name = ?, mobile = ?, business_name = ?, abn = ?, payment_method = ?, consent = ?, role = ? WHERE id = ?`)
      .run(name, mobile, business, abn, payment, consent, role, user.id);
    if (business) db.prepare("UPDATE organisations SET name = ? WHERE id = ?").run(business, user.organisation_id);
    audit(db, { actorId: user.id, organisationId: user.organisation_id, action: "account.profile_updated", subjectType: "user", subjectId: user.id, detail: { roleChanged: role !== user.role } });
    res.json({ user: publicUser(userById(user.id)), banner: bannerFor(userById(user.id)) });
  });

  app.post("/api/change-password", requireJson, requireUser, async (req, res) => {
    const user = req.user;
    const match = await verifyPassword(String(req.body?.current || ""), user.password_hash);
    if (!match) return sendError(res, 400, "The current password is not right.");
    const problem = passwordProblem(req.body?.password, user.email);
    if (problem) return sendError(res, 400, problem);
    if (req.body?.password !== req.body?.confirm) return sendError(res, 400, "The two passwords do not match.");
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(req.body.password), user.id);
    const token = readCookie(req, "strata_session");
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(user.id, hashToken(token));
    audit(db, { actorId: user.id, organisationId: user.organisation_id, action: "account.password_changed", subjectType: "user", subjectId: user.id, detail: {} });
    res.json({ ok: true, message: "Password changed. The old password no longer works." });
  });

  app.get("/api/me/export", requireUser, (req, res) => {
    const notes = db.prepare("SELECT id, body, author_name, created_at FROM notes WHERE organisation_id = ? ORDER BY created_at").all(req.user.organisation_id);
    const privacy = db.prepare("SELECT id, kind, detail, status, created_at FROM privacy_requests WHERE user_id = ?").all(req.user.id);
    res.json({
      exportedAt: new Date().toISOString(),
      profile: publicUser(req.user),
      notes,
      privacyRequests: privacy,
      note: "Passwords, session cookies and email links are not included. A solicitor still needs to confirm how long records are kept."
    });
  });

  app.post("/api/privacy-requests", requireJson, requireUser, (req, res) => {
    const kind = String(req.body?.kind || "");
    if (!["copy", "correct", "delete", "other"].includes(kind)) return sendError(res, 400, "Choose what the request is for.");
    const id = newId();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO privacy_requests (id, user_id, kind, detail, status, created_at) VALUES (?, ?, ?, ?, 'Received', ?)")
      .run(id, req.user.id, kind, String(req.body?.detail || "").slice(0, 2000), now);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "privacy.requested", subjectType: "privacy_request", subjectId: id, detail: { kind } });
    res.status(201).json({
      id,
      status: "Received",
      message: "The request is recorded. A reply is aimed for within 30 days. Some records must be kept. A solicitor must confirm that period."
    });
  });

  app.get("/api/notes", requireUser, (req, res) => {
    const rows = db.prepare("SELECT id, author_name, body, created_at FROM notes WHERE organisation_id = ? ORDER BY created_at DESC").all(req.user.organisation_id);
    res.json({ notes: rows });
  });

  app.post("/api/notes", requireJson, requireUser, (req, res) => {
    if (req.user.role === "contractor") return sendError(res, 403, "Notices and comments are for the manager account.");
    const body = String(req.body?.text || "").trim();
    if (!body) return sendError(res, 400, "Write a short note first.");
    if (body.length > 2000) return sendError(res, 400, "Keep the note under 2,000 characters.");
    const id = newId();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO notes (id, organisation_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, req.user.organisation_id, req.user.id, req.user.name, body, now);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "note.added", subjectType: "note", subjectId: id, detail: {} });
    res.status(201).json({ note: { id, author_name: req.user.name, body, created_at: now } });
  });

  app.get("/api/owner/settings", requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can open these settings.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "owner.settings_viewed", subjectType: "owner", subjectId: req.user.id, detail: {} });
    res.json({
      feePercent: 15,
      gstOnFee: false,
      maxPayDays: 14,
      message: "These settings are stored for the platform owner only. Managers and contractors cannot open this screen."
    });
  });

  app.use("/api", (req, res) => {
    sendError(res, 404, "That page is not available.");
  });

  const publicDir = path.join(here, "..", "public");
  app.use(express.static(publicDir, { index: "index.html", etag: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });

  await ensureOwner(db, config);
  app.locals.db = db;
  app.locals.mail = mail;
  return app;
}

function bannerFor(user) {
  return `Signed in as ${user.name}, ${publicUser(user).roleLabel}. Buildings and jobs on this screen are still the sample set, until the server stores them. Your account is kept on the server.`;
}

async function ensureOwner(db, config) {
  if (!config.owner.email || !config.owner.password) return;
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(config.owner.email)) return;
  const now = new Date().toISOString();
  const orgId = newId();
  const userId = newId();
  const passwordHash = await hashPassword(config.owner.password);
  db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, ?, 'platform', ?)").run(orgId, "Platform", now);
  db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
    VALUES (?, ?, ?, ?, 'platform_owner', ?, '', 'Platform', '', '', 0, ?, ?)`).run(userId, orgId, config.owner.email, passwordHash, config.owner.name, now, now);
  audit(db, { actorId: userId, organisationId: orgId, action: "account.owner_created", subjectType: "user", subjectId: userId, detail: {} });
}
