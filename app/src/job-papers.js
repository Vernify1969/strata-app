import { audit } from "./db.js";
import { newId } from "./ids.js";
import { moneySettings } from "./payments.js";
import { feeOfCents } from "./rules.js";
import { saveObject, readObject } from "./storage.js";

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);

export function takeNumber(db, name, prefix) {
  db.prepare("INSERT INTO number_counters (name, next_value) VALUES (?, 1) ON CONFLICT(name) DO NOTHING").run(name);
  const row = db.prepare("SELECT next_value FROM number_counters WHERE name = ?").get(name);
  db.prepare("UPDATE number_counters SET next_value = ? WHERE name = ?").run(row.next_value + 1, name);
  return prefix + String(row.next_value).padStart(4, "0");
}

export function registerJobPaperRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  app.post("/api/jobs/:id/variations", requireJson, requireUser, (req, res) => {
    const job = booked(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not booked to you.");
    if (!job.work_order || job.stage === "open") return sendError(res, 400, "Extra work can be requested after a work order is issued.");
    const amount = Math.round(Number(req.body?.amount) * 100);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!amount || amount <= 0) return sendError(res, 400, "Add the extra amount.");
    if (reason.length < 3) return sendError(res, 400, "Say what the extra work is.");
    const count = db.prepare("SELECT COUNT(*) AS n FROM job_variations WHERE job_id = ?").get(job.id).n + 1;
    const number = job.work_order + "-V" + count;
    const id = newId();
    db.prepare("INSERT INTO job_variations (id, job_id, number, amount_cents, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, job.id, number, amount, reason, new Date().toISOString()
    );
    addEvent(db, job.id, req.user.name, "Asked for extra work " + number + ".");
    res.status(201).json({ id, number, status: "requested" });
  });

  app.post("/api/jobs/:id/variations/:variationId/approve", requireJson, requireUser, (req, res) => {
    const job = managed(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const row = variation(db, job.id, req.params.variationId, "requested");
    if (!row) return sendError(res, 404, "That extra work is not waiting.");
    db.prepare("UPDATE job_variations SET status = 'approved', decided_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    db.prepare("UPDATE jobs SET approved_cents = COALESCE(approved_cents, 0) + ? WHERE id = ?").run(row.amount_cents, job.id);
    addEvent(db, job.id, req.user.name, "Approved extra work " + row.number + ".");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "variation.approved", subjectType: "variation", subjectId: row.id, detail: { number: row.number } });
    res.json({ status: "approved", number: row.number, agreedCents: (job.approved_cents || 0) + row.amount_cents });
  });

  app.post("/api/jobs/:id/variations/:variationId/decline", requireJson, requireUser, (req, res) => {
    const job = managed(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const row = variation(db, job.id, req.params.variationId, "requested");
    if (!row) return sendError(res, 404, "That extra work is not waiting.");
    const reason = String(req.body?.reason || "").trim().slice(0, 200);
    if (reason.length < 3) return sendError(res, 400, "Say why you are declining the extra work.");
    db.prepare("UPDATE job_variations SET status = 'declined', decline_reason = ?, decided_at = ? WHERE id = ?").run(reason, new Date().toISOString(), row.id);
    addEvent(db, job.id, req.user.name, "Declined extra work " + row.number + ".");
    res.json({ status: "declined", number: row.number });
  });

  app.post("/api/jobs/:id/invoice-file", requireJson, requireUser, async (req, res) => {
    const job = booked(db, req.user, req.params.id);
    if (!job || !job.work_order) return sendError(res, 404, "That job is not booked to you.");
    const number = String(req.body?.number || "").trim().slice(0, 40);
    const amount = Math.round(Number(req.body?.amount) * 100);
    if (number.length < 2) return sendError(res, 400, "Add the invoice number.");
    if (!amount || amount <= 0) return sendError(res, 400, "Add the invoice amount.");
    const file = await storeFile(config, req.body?.data, req.body?.fileName);
    if (file.error) return sendError(res, 400, file.error);
    const id = newId();
    const held = amount > (job.approved_cents || 0);
    db.prepare(`INSERT INTO job_invoices (id, job_id, number, amount_cents, gst, status, stored_name, original_name, content_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, job.id, number, amount, req.body?.gst === false ? 0 : 1, held ? "held" : "received",
      file.name, file.original, file.type, new Date().toISOString()
    );
    addEvent(db, job.id, req.user.name, "Invoice " + number + " uploaded" + (held ? ". It is above the agreed price, so it is held." : "."));
    res.status(201).json({ id, number, status: held ? "held" : "received", held });
  });

  app.post("/api/jobs/:id/invoices/:invoiceId/return", requireJson, requireUser, (req, res) => {
    return decideInvoice(db, req, res, sendError, "returned", "Sent the invoice back to be corrected.");
  });

  app.post("/api/jobs/:id/invoices/:invoiceId/reject", requireJson, requireUser, (req, res) => {
    return decideInvoice(db, req, res, sendError, "rejected", "Rejected the invoice.");
  });

  app.get("/api/jobs/:id/invoices/:invoiceId/file", requireUser, async (req, res) => {
    const job = seen(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const row = db.prepare("SELECT * FROM job_invoices WHERE id = ? AND job_id = ?").get(req.params.invoiceId, job.id);
    if (!row || !row.stored_name) return sendError(res, 404, "That invoice file is not stored.");
    const bytes = await readObject(config, "photo", row.stored_name);
    if (!bytes) return sendError(res, 404, "That invoice file is no longer stored.");
    res.setHeader("Content-Type", row.content_type || "application/octet-stream");
    res.send(bytes);
  });

  app.get("/api/jobs/:id/documents/variation/:variationId", requireUser, (req, res) => {
    const job = seen(db, req.user, req.params.id);
    const row = job && db.prepare("SELECT * FROM job_variations WHERE id = ? AND job_id = ?").get(req.params.variationId, job.id);
    if (!row) return sendError(res, 404, "That extra work is not on this job.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(variationPage(db, job, row));
  });

  app.get("/api/jobs/:id/documents/:kind", requireUser, (req, res) => {
    const job = seen(db, req.user, req.params.id);
    if (!job || !job.work_order) return sendError(res, 404, "That job has no work order yet.");
    const kind = req.params.kind;
    const page = kind === "work-order" ? workOrderPage(db, job)
      : kind === "quote" ? quotePage(db, job)
        : kind === "invoice" ? invoicePage(db, job)
          : kind === "fee" ? feePage(db, config, job, req.user)
            : null;
    if (!page) return sendError(res, 404, "That document is not available.");
    if (req.user.role === "contractor" && kind === "fee" && job.contractor_user_id !== req.user.id) {
      return sendError(res, 403, "The fee invoice goes to the contractor only.");
    }
    if (kind === "fee" && req.user.role !== "contractor" && req.user.role !== "platform_owner") {
      return sendError(res, 403, "The fee invoice goes to the contractor only.");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(page);
  });

}

function decideInvoice(db, req, res, sendError, status, event) {
  const job = managed(db, req.user, req.params.id);
  if (!job) return sendError(res, 404, "That job is not on your account.");
  const row = db.prepare("SELECT * FROM job_invoices WHERE id = ? AND job_id = ?").get(req.params.invoiceId, job.id);
  if (!row || (row.status !== "received" && row.status !== "held")) return sendError(res, 404, "That invoice is not waiting for a decision.");
  const reason = String(req.body?.reason || "").trim().slice(0, 300);
  if (reason.length < 3) return sendError(res, 400, "Say why the invoice needs to change.");
  db.prepare("UPDATE job_invoices SET status = ?, return_reason = ? WHERE id = ?").run(status, reason, row.id);
  addEvent(db, job.id, req.user.name, event + " " + row.number + ": " + reason);
  audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "invoice." + status, subjectType: "invoice", subjectId: row.id, detail: { reason } });
  res.json({ status, number: row.number });
}

async function storeFile(config, data, fileName) {
  const original = String(fileName || "invoice").slice(0, 80);
  if (typeof data !== "string" || !data.startsWith("data:")) return { error: "Upload the invoice file." };
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) return { error: "That file could not be read." };
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return { error: "That file is empty or too large." };
  const id = newId();
  const name = "invoice-" + id;
  await saveObject(config, "photo", name, bytes, match[1]);
  return { name, original, type: match[1] };
}

function booked(db, user, id) {
  if (user.role !== "contractor") return null;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return job && job.contractor_user_id === user.id ? job : null;
}

function managed(db, user, id) {
  if (!MANAGER.has(user.role)) return null;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!job || job.organisation_id !== user.organisation_id) return null;
  const assigned = db.prepare("SELECT 1 AS ok FROM building_assignments WHERE user_id = ? AND building_id = ?").get(user.id, job.building_id);
  return assigned ? job : null;
}

function seen(db, user, id) {
  return booked(db, user, id) || managed(db, user, id);
}

function variation(db, jobId, id, status) {
  return db.prepare("SELECT * FROM job_variations WHERE id = ? AND job_id = ? AND status = ?").get(id, jobId, status);
}

function addEvent(db, jobId, actor, body) {
  db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(jobId, new Date().toISOString(), actor, body);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function money(cents) {
  return "A$" + (Number(cents || 0) / 100).toFixed(2);
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:16px/1.5 "Plus Jakarta Sans",system-ui,sans-serif;color:#0B1F44;margin:32px;max-width:720px}h1{font-size:28px}h2{font-size:18px;margin-top:24px}p{margin:6px 0}.muted{color:#3E4C63}button{min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid #D5DDE6;background:#fff;font:inherit}@media print{button{display:none}}</style></head>
<body>${body}<p><button type="button" onclick="print()">Print or save as PDF</button></p></body></html>`;
}

function workOrderPage(db, job) {
  const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
  const contractor = db.prepare("SELECT * FROM users WHERE id = ?").get(job.contractor_user_id);
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(job.awarded_quote_id);
  const extras = db.prepare("SELECT * FROM job_variations WHERE job_id = ? AND status = 'approved'").all(job.id);
  const scope = JSON.parse(quote?.scope || "[]").map(item => "<li>" + esc(item) + "</li>").join("");
  const extraLines = extras.map(row => "<p>Extra " + esc(row.number) + ": " + money(row.amount_cents) + " — " + esc(row.reason) + "</p>").join("");
  return page("Work order " + job.work_order, `<p class="muted">Work order</p><h1>${esc(job.work_order)}</h1>
<h2>To</h2><p>${esc(contractor?.name || "")}</p><h2>Site</h2><p>${esc(building.name)}<br>${esc(building.street_number)} ${esc(building.street)}, ${esc(building.suburb)}</p><p>${esc(job.area)}</p>
<h2>The job</h2><p><strong>${esc(job.title)}</strong></p><p>${esc(job.instructions)}</p><ul>${scope}</ul>${extraLines}
<p>Agreed price ${money(job.approved_cents)}</p><p>Quote ${esc(quote?.quote_number || "")}</p>
<p class="muted">Send your tax invoice for this work order through TaskSpeck Strata. The amount should match the agreed price.</p>`);
}

function quotePage(db, job) {
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(job.awarded_quote_id);
  const contractor = db.prepare("SELECT * FROM users WHERE id = ?").get(quote?.contractor_user_id);
  const scope = JSON.parse(quote?.scope || "[]").map(item => "<li>" + esc(item) + "</li>").join("");
  return page("Quote " + (quote?.quote_number || ""), `<p class="muted">Quote</p><h1>${esc(quote?.quote_number || "Quote")}</h1>
<p>From ${esc(contractor?.name || "")}</p><p><strong>${esc(job.title)}</strong></p><ul>${scope}</ul><p>Total ${money(quote?.price_cents)}</p>
<p class="muted">If this quote is approved, the work order uses the same details.</p>`);
}

function variationPage(db, job, row) {
  return page(row.number, `<p class="muted">Extra work</p><h1>${esc(row.number)}</h1><p>${esc(job.title)} · ${esc(job.work_order)}</p>
<p>${esc(row.reason)}</p><p>Amount ${money(row.amount_cents)}</p><p>Status ${esc(row.status)}</p>${row.decline_reason ? "<p>Declined: " + esc(row.decline_reason) + "</p>" : ""}`);
}

function invoicePage(db, job) {
  const row = db.prepare("SELECT * FROM job_invoices WHERE job_id = ? AND status != 'returned' ORDER BY created_at DESC LIMIT 1").get(job.id)
    || db.prepare("SELECT * FROM job_invoices WHERE job_id = ? ORDER BY created_at DESC LIMIT 1").get(job.id);
  if (!row) return null;
  return page("Invoice " + row.number, `<p class="muted">Invoice</p><h1>${esc(row.number)}</h1>
<p>${esc(job.title)} · ${esc(job.work_order)}</p><p>Amount ${money(row.amount_cents)}</p><p>Status ${esc(row.status)}</p>
<p>File ${esc(row.original_name || "uploaded invoice")}</p>${row.return_reason ? "<p>" + esc(row.return_reason) + "</p>" : ""}
<p class="muted">The uploaded file is stored with the job. This page is the printable copy.</p>`);
}

function feePage(db, config, job) {
  const settings = moneySettings(db, config);
  const fee = feeOfCents(job.approved_cents || 0, settings.commissionPercent, false);
  const number = "TS-" + String(job.work_order || "").replace(/^WO-/, "");
  return page(number, `<p class="muted">TaskSpeck Strata</p><h1>Invoice ${esc(number)}</h1>
<p>Platform fee on ${esc(job.work_order)}</p><p>${esc(job.title)}</p>
<p>Agreed price ${money(job.approved_cents)}</p><p>Platform fee (${settings.commissionPercent}%) ${money(fee.fee)}</p>
<p>GST on the fee: not charged. The platform is not registered for GST, so this is not a tax invoice yet.</p>
<p>The fee is taken from the contractor’s payout. The manager does not receive this invoice and pays no fee.</p>`);
}
