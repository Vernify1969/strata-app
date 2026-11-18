import { newId } from "./ids.js";
import { moneySettings } from "./payments.js";
import { readDocumentBytes } from "./documents.js";
import { readObject } from "./storage.js";
import { HELPERS, completeAi, draftEnvelope, estimateAudCents, redactContacts } from "./ai.js";

const MANAGERS = new Set(["building_manager", "oc_manager", "property_manager"]);
const SYSTEM = "You draft short notes for a building manager in Victoria, Australia. Every answer is a draft. You never approve work, spend money, send a message, or book anyone. You do not give legal advice. Do not invent names, phone numbers, or email addresses. Keep the answer under 180 words.";

function monthKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit" }).format(now);
}

function spentCents(db, userId, month) {
  return db.prepare("SELECT COALESCE(SUM(cost_cents), 0) AS n FROM ai_uses WHERE user_id = ? AND month = ? AND demo = 0").get(userId, month).n;
}

export function usageFor(db, userId, now = new Date()) {
  const settings = moneySettings(db);
  const month = monthKey(now);
  const spent = spentCents(db, userId, month);
  const recent = db.prepare("SELECT helper, demo, cost_cents, created_at, subject_type, subject_id FROM ai_uses WHERE user_id = ? AND month = ? ORDER BY created_at DESC LIMIT 20").all(userId, month);
  return {
    month,
    spentCents: spent,
    capCents: settings.aiCapCents,
    remainingCents: Math.max(0, settings.aiCapCents - spent),
    recent
  };
}

function ownBuilding(db, user, id) {
  return db.prepare(`SELECT buildings.* FROM buildings
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE buildings.id = ? AND buildings.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function ownReport(db, user, id) {
  return db.prepare(`SELECT reports.*, places.name AS place_name, buildings.name AS building_name FROM reports
    JOIN places ON places.id = reports.place_id
    JOIN buildings ON buildings.id = reports.building_id
    JOIN building_assignments ON building_assignments.building_id = reports.building_id
    WHERE reports.id = ? AND reports.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function ownJob(db, user, id) {
  return db.prepare(`SELECT jobs.* FROM jobs
    JOIN building_assignments ON building_assignments.building_id = jobs.building_id
    WHERE jobs.id = ? AND jobs.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function canSeeDocument(db, user, doc) {
  if (!doc) return false;
  const link = db.prepare(`SELECT 1 FROM quotes
    JOIN jobs ON jobs.id = quotes.job_id
    WHERE quotes.contractor_user_id = ? AND jobs.organisation_id = ?`).get(doc.user_id, user.organisation_id);
  return !!link;
}

async function reportPhotos(config, reportId) {
  const images = [];
  for (let index = 0; index < 2; index += 1) {
    let bytes = null;
    try { bytes = await readObject(config, "photo", reportId + "-" + index + ".img"); } catch { bytes = null; }
    if (!bytes || bytes.length < 8 || bytes.length > 350000) continue;
    const mediaType = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "";
    if (!mediaType) continue;
    images.push({ mediaType, data: Buffer.from(bytes).toString("base64") });
  }
  return images;
}

function waitingFacts(db, user) {
  const jobs = db.prepare(`SELECT jobs.stage, jobs.title, jobs.needs_prepay, jobs.deposit_due_at FROM jobs
    JOIN building_assignments ON building_assignments.building_id = jobs.building_id
    WHERE jobs.organisation_id = ? AND building_assignments.user_id = ?`).all(user.organisation_id, user.id);
  return jobs.filter(job => ["open", "approved", "review0", "review1"].includes(job.stage)).map(job => ({
    title: redactContacts(job.title),
    stage: job.stage,
    waiting: job.stage === "open" ? "quotes" : job.stage === "approved" ? "deposit" : "your review"
  }));
}

async function contextFor(db, config, user, helper, body) {
  if (helper === "triage" || helper === "job-draft") {
    const report = ownReport(db, user, String(body.reportId || ""));
    if (!report) return { error: "That report is not on your account." };
    const images = await reportPhotos(config, report.id);
    const userText = `${helper === "triage" ? "Triage this resident report. Suggest a category, an urgency, whether it looks like a duplicate of the other open reports, and up to three follow-up questions." : "Write a short job description a contractor could price. Do not include anyone's contact details."}
Building: ${redactContacts(report.building_name)}
Place: ${redactContacts(report.place_name)}
Kind named on the form: ${report.kind}
What they wrote: ${redactContacts(report.description).slice(0, 1200)}
Photos attached: ${images.length}`;
    return { userText, images, subjectType: "report", subjectId: report.id };
  }
  if (helper === "quote-compare" || helper === "committee" || helper === "budget-warning") {
    const job = ownJob(db, user, String(body.jobId || ""));
    if (!job) return { error: "That job is not on your account." };
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const quotes = db.prepare("SELECT price_cents, deposit_type, scope, note FROM quotes WHERE job_id = ? AND status = 'open'").all(job.id);
    const lines = quotes.map((quote, index) => `Offer ${index + 1}: $${(quote.price_cents / 100).toFixed(2)}, deposit ${quote.deposit_type}, included: ${redactContacts(quote.scope).slice(0, 400)}`);
    const tiers = building.tiers_confirmed
      ? `Budgets: $${building.tier1_cents / 100} (${building.tier1_quotes} quotes), $${building.tier2_cents / 100} (${building.tier2_quotes}), $${building.tier3_cents / 100} (${building.tier3_quotes}).`
      : "Budgets are not set.";
    const ask = helper === "quote-compare"
      ? "Compare the offers. Say what is included or missing, whether GST or scope is unclear, and which budget level the totals sit in. Do not pick a winner as a decision."
      : helper === "committee"
        ? "Write a short committee summary. Do not recommend spending."
        : "Warn if a total sits in a higher budget or if the budgets are not set. Do not approve anything.";
    return {
      userText: `${ask}\nJob: ${redactContacts(job.title)}\nPlace in the building: ${redactContacts(job.area)}\n${tiers}\n${lines.join("\n") || "No open offers."}`,
      images: [],
      subjectType: "job",
      subjectId: job.id,
      facts: { tiersConfirmed: !!building.tiers_confirmed, offers: quotes.length }
    };
  }
  if (helper === "next-step") {
    const facts = waitingFacts(db, user);
    return {
      userText: `Say what is waiting, in a few lines, from this list only:\n${JSON.stringify(facts).slice(0, 2000)}`,
      images: [],
      subjectType: "",
      subjectId: "",
      facts
    };
  }
  if (helper === "missing-info") {
    const title = redactContacts(body.title).slice(0, 120);
    const area = redactContacts(body.area).slice(0, 120);
    const instructions = redactContacts(body.instructions).slice(0, 500);
    const missing = [];
    if (title.trim().length < 2) missing.push("a title");
    if (area.trim().length < 2) missing.push("the place in the building");
    if (instructions.trim().length < 3) missing.push("what the contractor should do");
    return {
      userText: `Before this job is posted, list what is still missing. Known title: ${title || "(blank)"}. Place: ${area || "(blank)"}. Instructions: ${instructions || "(blank)"}.`,
      images: [],
      subjectType: "draft",
      subjectId: "",
      facts: { missing }
    };
  }
  if (helper === "reply-draft") {
    const audience = body.audience === "contractor" ? "contractor" : "resident";
    let about = redactContacts(body.about).slice(0, 800);
    if (body.reportId) {
      const report = ownReport(db, user, String(body.reportId));
      if (!report) return { error: "That report is not on your account." };
      about = redactContacts(report.description).slice(0, 800);
    } else if (body.jobId) {
      const job = ownJob(db, user, String(body.jobId));
      if (!job) return { error: "That job is not on your account." };
      about = redactContacts(job.title + ". " + job.instructions).slice(0, 800);
    }
    return {
      userText: `Draft a short reply the manager might send to the ${audience}. Do not include a phone number or an email address. The manager will send it themselves.\nSubject: ${about || "(none)"}`,
      images: [],
      subjectType: body.reportId ? "report" : "job",
      subjectId: String(body.reportId || body.jobId || "")
    };
  }
  if (helper === "handover") {
    const building = ownBuilding(db, user, String(body.buildingId || ""));
    if (!building) return { error: "That building is not on your account." };
    const notes = db.prepare("SELECT body FROM notes WHERE organisation_id = ? ORDER BY created_at DESC LIMIT 5").all(user.organisation_id);
    const jobs = db.prepare("SELECT title, stage FROM jobs WHERE building_id = ? ORDER BY created_at DESC LIMIT 8").all(building.id);
    return {
      userText: `Draft handover notes for the next manager of ${redactContacts(building.name)}. Notices: ${notes.map(note => redactContacts(note.body).slice(0, 200)).join(" | ") || "none"}. Jobs: ${jobs.map(job => redactContacts(job.title) + " (" + job.stage + ")").join("; ") || "none"}.`,
      images: [],
      subjectType: "building",
      subjectId: building.id
    };
  }
  if (helper === "paperwork") {
    const doc = db.prepare("SELECT contractor_documents.*, users.name AS person_name, users.abn, users.business_name FROM contractor_documents JOIN users ON users.id = contractor_documents.user_id WHERE contractor_documents.id = ?").get(String(body.documentId || ""));
    if (!canSeeDocument(db, user, doc)) return { error: "That document is not one you can check." };
    let bytes = null;
    try { bytes = await readObject(config, "document", doc.stored_name); } catch { bytes = null; }
    const read = bytes ? await readDocumentBytes(bytes, doc.mime) : { textFound: false, suggestedExpiry: "", suggestedNumber: "", note: "" };
    const settings = moneySettings(db);
    const minimum = settings.minCoverCents / 100;
    return {
      userText: `Check this ${doc.kind} paperwork. Pre-fill the holder name, number, cover amount and expiry only when the words support them. Compare the holder with the profile name "${redactContacts(doc.person_name)}" and the business "${redactContacts(doc.business_name)}". The profile ABN is ${doc.abn || "not set"}. Flag a mismatch, an expiry that is past or within 30 days, and cover below $${minimum}. Words found: ${read.textFound ? "yes" : "no"}. Stored expiry: ${doc.expiry_on || read.suggestedExpiry || "none"}. Stored number: ${doc.licence_number || read.suggestedNumber || "none"}. Reader note: ${redactContacts(read.note || "").slice(0, 400)}`,
      images: [],
      subjectType: "document",
      subjectId: doc.id,
      facts: { minimumCoverDollars: minimum, expiry: doc.expiry_on || read.suggestedExpiry || "" }
    };
  }
  return { error: "That helper is not available." };
}

export function registerAssistantRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  app.get("/api/ai/usage", requireUser, (req, res) => {
    if (!MANAGERS.has(req.user.role) && req.user.role !== "platform_owner") return sendError(res, 403, "This account does not use the draft helper.");
    const usage = req.user.role === "platform_owner"
      ? ownerUsage(db)
      : usageFor(db, req.user.id);
    res.json({ ...usage, demoAvailable: !config.anthropicApiKey, capCents: moneySettings(db).aiCapCents });
  });

  app.post("/api/ai/:helper", requireJson, requireUser, async (req, res) => {
    if (!MANAGERS.has(req.user.role)) return sendError(res, 403, "Only a manager can ask for a draft.");
    const helper = req.params.helper;
    const spec = HELPERS[helper];
    if (!spec) return sendError(res, 404, "That helper is not available.");
    const month = monthKey();
    const settings = moneySettings(db);
    const spent = spentCents(db, req.user.id, month);
    const willBill = !!config.anthropicApiKey;
    if (willBill && spent >= settings.aiCapCents) {
      return sendError(res, 403, "This month's draft allowance is used. The platform owner can raise it.");
    }
    const built = await contextFor(db, config, req.user, helper, req.body || {});
    if (built.error) return sendError(res, 404, built.error);
    let result;
    try {
      result = await completeAi(config, {
        helper,
        model: spec.model,
        system: SYSTEM,
        user: built.userText,
        images: built.images
      });
    } catch (err) {
      return sendError(res, err.status || 502, err.message || "The draft could not be prepared.");
    }
    const demo = result.demo === true || !config.anthropicApiKey;
    const cost = demo ? 0 : estimateAudCents(spec.model, result.inputTokens, result.outputTokens);
    db.prepare(`INSERT INTO ai_uses (id, user_id, helper, model, demo, month, input_tokens, output_tokens, cost_cents, subject_type, subject_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), req.user.id, helper, demo ? "" : spec.model, demo ? 1 : 0, month,
      result.inputTokens || 0, result.outputTokens || 0, cost,
      built.subjectType || "", built.subjectId || "", new Date().toISOString()
    );
    const body = draftEnvelope(helper, { ...result, demo, model: spec.model });
    if (built.facts) body.facts = built.facts;
    body.model = demo ? "" : spec.model;
    res.json(body);
  });
}

function ownerUsage(db) {
  const month = monthKey();
  const rows = db.prepare("SELECT user_id, SUM(cost_cents) AS spent FROM ai_uses WHERE month = ? AND demo = 0 GROUP BY user_id").all(month);
  return { month, managers: rows, capCents: moneySettings(db).aiCapCents, spentCents: rows.reduce((sum, row) => sum + row.spent, 0) };
}
