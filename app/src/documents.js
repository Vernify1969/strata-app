import fs from "node:fs";
import path from "node:path";
import { audit } from "./db.js";
import { newId } from "./ids.js";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function readDocumentBytes(buffer, mime) {
  const text = mime === "application/pdf" ? extractPdfText(buffer) : "";
  const dates = text.match(/20\d{2}-\d{2}-\d{2}/g) || [];
  const number = (text.match(/licen[cs]e[:\s#-]*([A-Z0-9-]{4,})/i) || [])[1] || "";
  let suggestedKind = "";
  if (/insurance/i.test(text)) suggestedKind = "insurance";
  else if (/licen[cs]e/i.test(text)) suggestedKind = "licence";
  return {
    textFound: text.length > 0,
    suggestedExpiry: dates.sort().at(-1) || "",
    suggestedNumber: number,
    suggestedKind,
    note: text
      ? "These details were read from the file. Confirm or correct them."
      : "The file had no readable text. Type the expiry and the number yourself. Picture reading is not connected yet."
  };
}

export function lookupVbaLicence() {
  return {
    available: false,
    source: "Victorian Building Authority",
    message: "Public register lookup is not connected yet. The badge stays Documents checked (self-declared)."
  };
}

export function alertDay(expiry, today) {
  const days = Math.round((Date.parse(expiry + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
  if (days === 30 || days === 7 || days === 0) return days;
  return null;
}

export function complianceBlock(db, userId, today) {
  const rows = db.prepare("SELECT kind, expiry_on, created_at FROM contractor_documents WHERE user_id = ? ORDER BY created_at DESC").all(userId);
  const latest = {};
  for (const row of rows) if (!latest[row.kind]) latest[row.kind] = row;
  const expired = Object.values(latest).find(row => row.expiry_on < today);
  if (!expired) return "";
  const label = expired.kind === "insurance" ? "insurance" : "licence";
  return `The ${label} on file expired on ${expired.expiry_on}. Upload a current one before taking new work.`;
}

export function registerDocumentRoutes(app, { db, config, mail, sendError, requireUser, requireJson }) {
  const documentsPath = config.documentsPath || path.join(config.root, "var", "documents");
  fs.mkdirSync(documentsPath, { recursive: true });

  app.post("/api/documents", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "contractor") return sendError(res, 403, "Only a contractor uploads licence and insurance.");
    if (req.body?.declaration !== true) return sendError(res, 400, "Tick the declaration that the document is true, current, and your responsibility.");
    const mime = String(req.body?.mime || "");
    if (!ALLOWED.has(mime)) return sendError(res, 400, "Upload a PDF or a picture (JPEG, PNG, or WebP).");
    const bytes = Buffer.from(String(req.body?.dataBase64 || ""), "base64");
    if (!bytes.length || bytes.length > 5_000_000) return sendError(res, 400, "The file is missing or larger than 5 MB.");
    const kind = req.body?.kind === "insurance" ? "insurance" : req.body?.kind === "licence" ? "licence" : "";
    if (!kind) return sendError(res, 400, "Say whether this is a licence or insurance.");
    const suggestions = readDocumentBytes(bytes, mime);
    const expiry = calendarDate(req.body?.expiry) || suggestions.suggestedExpiry;
    if (!expiry) return sendError(res, 400, "Add the expiry date. The file did not contain one we could read.");
    const number = String(req.body?.licenceNumber || suggestions.suggestedNumber || "").slice(0, 40);
    const id = newId();
    const stored = id + (mime === "application/pdf" ? ".pdf" : ".img");
    fs.writeFileSync(path.join(documentsPath, stored), bytes);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO contractor_documents
      (id, user_id, kind, stored_name, original_name, mime, declared, declared_at, expiry_on, licence_number, suggested_expiry, suggested_number, suggested_kind, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user.id, kind, stored, String(req.body?.filename || "document").slice(0, 120), mime, now, expiry, number,
      suggestions.suggestedExpiry, suggestions.suggestedNumber, suggestions.suggestedKind, now
    );
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "document.declared", subjectType: "document", subjectId: id, detail: { kind, expiry } });
    res.status(201).json({
      document: publicDoc(db.prepare("SELECT * FROM contractor_documents WHERE id = ?").get(id)),
      suggestions,
      register: lookupVbaLicence(),
      badge: "Documents checked (self-declared)"
    });
  });

  app.get("/api/documents", requireUser, (req, res) => {
    const userId = req.user.role === "contractor" ? req.user.id : String(req.query.contractorId || "");
    if (!userId) return res.json({ documents: [], badge: "Documents checked (self-declared)" });
    if (!canView(db, req.user, userId)) return sendError(res, 403, "You cannot open those documents.");
    const documents = db.prepare("SELECT * FROM contractor_documents WHERE user_id = ? ORDER BY created_at DESC").all(userId).map(publicDoc);
    res.json({ documents, badge: "Documents checked (self-declared)" });
  });

  app.get("/api/documents/:id/file", requireUser, (req, res) => {
    const row = db.prepare("SELECT * FROM contractor_documents WHERE id = ?").get(req.params.id);
    if (!row || !canView(db, req.user, row.user_id)) return sendError(res, 403, "You cannot open that document.");
    const file = path.join(documentsPath, row.stored_name);
    if (!fs.existsSync(file)) return sendError(res, 404, "That file is missing.");
    res.setHeader("Content-Type", row.mime);
    res.setHeader("Content-Disposition", "inline; filename=\"" + row.original_name.replace(/"/g, "") + "\"");
    res.send(fs.readFileSync(file));
  });

  app.get("/api/notifications", requireUser, (req, res) => {
    const rows = db.prepare("SELECT id, body, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.user.id);
    res.json({ notifications: rows });
  });

  app.post("/api/documents/alerts/run", requireJson, requireUser, async (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner runs the reminder check.");
    const today = calendarDate(req.body?.today);
    if (!today) return sendError(res, 400, "Give the day to check, as YYYY-MM-DD.");
    const sent = await sendDueAlerts(db, mail, today);
    res.json({ sent });
  });
}

export async function sendDueAlerts(db, mail, today) {
  const docs = db.prepare("SELECT contractor_documents.*, users.email, users.name FROM contractor_documents JOIN users ON users.id = contractor_documents.user_id").all();
  let sent = 0;
  for (const doc of docs) {
    const days = alertDay(doc.expiry_on, today);
    if (days == null) continue;
    const managers = managersFor(db, doc.user_id);
    const people = [{ id: doc.user_id, email: doc.email, audience: "contractor" }, ...managers];
    for (const person of people) {
      const already = db.prepare("SELECT 1 FROM document_alerts WHERE document_id = ? AND user_id = ? AND days_before = ?").get(doc.id, person.id, days);
      if (already) continue;
      const when = days === 0 ? "has expired" : `expires in ${days} days`;
      const body = `${doc.name}'s ${doc.kind} ${when} (${doc.expiry_on}). The badge stays Documents checked (self-declared).`;
      await mail.send({ to: person.email, subject: days === 0 ? "A document has expired" : "A document is close to expiry", text: body });
      db.prepare("INSERT INTO notifications (id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(newId(), person.id, body, new Date().toISOString());
      db.prepare("INSERT INTO document_alerts (document_id, user_id, days_before, sent_at) VALUES (?, ?, ?, ?)").run(doc.id, person.id, days, new Date().toISOString());
      sent += 1;
    }
  }
  return sent;
}

function managersFor(db, contractorId) {
  return db.prepare(`SELECT DISTINCT users.id, users.email FROM users
    JOIN jobs ON jobs.organisation_id = users.organisation_id
    JOIN quotes ON quotes.job_id = jobs.id
    WHERE quotes.contractor_user_id = ? AND users.role IN ('building_manager', 'oc_manager', 'property_manager')`).all(contractorId);
}

function canView(db, user, ownerId) {
  if (user.role === "platform_owner") return true;
  if (user.id === ownerId) return true;
  if (!["building_manager", "oc_manager", "property_manager"].includes(user.role)) return false;
  const link = db.prepare(`SELECT 1 FROM quotes
    JOIN jobs ON jobs.id = quotes.job_id
    WHERE quotes.contractor_user_id = ? AND jobs.organisation_id = ?`).get(ownerId, user.organisation_id);
  return !!link;
}

function publicDoc(row) {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.original_name,
    expiry: row.expiry_on,
    licenceNumber: row.licence_number,
    declaredAt: row.declared_at,
    suggestedExpiry: row.suggested_expiry,
    suggestedNumber: row.suggested_number,
    suggestedKind: row.suggested_kind,
    badge: "Documents checked (self-declared)"
  };
}

function calendarDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return text;
}

function extractPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const parts = [];
  const re = /\((?:\\\)|\\.|[^)]){2,200}\)/g;
  let match;
  while ((match = re.exec(raw))) parts.push(match[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\(.)/g, "$1"));
  return parts.join(" ");
}
