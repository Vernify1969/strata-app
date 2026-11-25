import { audit } from "./db.js";
import { newId } from "./ids.js";
import { moneySettings } from "./payments.js";

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);
const KINDS = ["weekly", "fortnightly", "monthly", "quarterly"];

export function registerReportPackRoutes(app, { db, config, mail, sendError, requireUser, requireJson }) {
  app.get("/api/me/report-schedule", requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager sets a report schedule.");
    res.json({ schedule: req.user.report_schedule || "off" });
  });

  app.patch("/api/me/report-schedule", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager sets a report schedule.");
    const schedule = ["off", "weekly", "fortnightly", "monthly"].includes(req.body?.schedule) ? req.body.schedule : "";
    if (!schedule) return sendError(res, 400, "Choose off, weekly, fortnightly or monthly.");
    db.prepare("UPDATE users SET report_schedule = ? WHERE id = ?").run(schedule, req.user.id);
    res.json({ schedule });
  });

  app.get("/api/reports/due", requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return res.json({ committee: [], statements: [], month: "" });
    const month = previousMonth(melbourneDay());
    const committee = [];
    const statements = [];
    for (const building of assignedBuildings(db, req.user)) {
      const sent = submitted(db, building.id, building.world === "private" ? "statement" : "committee", month);
      if (sent) continue;
      const item = { buildingId: building.id, name: building.name, month };
      if (building.world === "private") {
        if (building.owner_email) statements.push(item);
      } else committee.push(item);
    }
    res.json({ committee, statements, month });
  });

  app.get("/api/reports/submitted", requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager can open reports.");
    const rows = db.prepare(`SELECT id, building_id, kind, period, sent_to, sent_by, created_at
      FROM submitted_reports WHERE organisation_id = ? ORDER BY created_at DESC LIMIT 40`).all(req.user.organisation_id);
    res.json({
      reports: rows.map(row => ({
        id: row.id, buildingId: row.building_id, kind: row.kind, period: row.period,
        sentTo: row.sent_to, sentBy: row.sent_by, createdAt: row.created_at
      }))
    });
  });

  app.get("/api/reports/summary", requireUser, (req, res) => sendPack(res, summaryFor(db, req.user, req.query), false));
  app.get("/api/reports/summary.pdf", requireUser, (req, res) => sendPack(res, summaryFor(db, req.user, req.query), true));
  app.get("/api/reports/summary.csv", requireUser, (req, res) => {
    const pack = summaryFor(db, req.user, req.query);
    if (pack.error) return sendError(res, pack.status, pack.error);
    res.type("text/csv").send(csv(pack.rows));
  });

  app.get("/api/buildings/:id/committee-report", requireUser, (req, res) => {
    const built = committeePack(db, req.user, req.params.id, req.query.month);
    if (built.error) return sendError(res, built.status, built.error);
    sendPack(res, built, false);
  });

  app.get("/api/buildings/:id/committee-report.pdf", requireUser, (req, res) => {
    const built = committeePack(db, req.user, req.params.id, req.query.month);
    if (built.error) return sendError(res, built.status, built.error);
    sendPack(res, built, true);
  });

  app.post("/api/buildings/:id/committee-report/submit", requireJson, requireUser, async (req, res) => {
    const building = managedBuilding(db, req.user, req.params.id);
    if (!building) return sendError(res, 404, "That building is not on your account.");
    if (building.world === "private") return sendError(res, 400, "A private rental uses an owner statement, not a committee report.");
    const month = String(req.body?.month || previousMonth(melbourneDay()));
    if (!/^\d{4}-\d{2}$/.test(month)) return sendError(res, 400, "Choose a month as YYYY-MM.");
    if (melbourneDay() < monthEnd(month)) return sendError(res, 400, "You can submit the Monthly Maintenance Report on the last day of the month.");
    const emails = splitEmails(building.committee_emails);
    if (!emails.length) return sendError(res, 400, "Add the committee email addresses first.");
    if (submitted(db, building.id, "committee", month)) return sendError(res, 400, "That month has already been submitted. The copy stays as it was sent.");
    const built = committeePack(db, req.user, building.id, month);
    const id = storeReport(db, { building, kind: "committee", period: month, html: built.html, sentTo: emails.join(", "), sentBy: req.user.name });
    for (const to of emails) {
      await mail.send({
        to,
        subject: "Monthly Maintenance Report " + month + " — " + building.name,
        text: "The Monthly Maintenance Report for " + building.name + " (" + month + ") is ready. Print or save it as a PDF from TaskSpeck Strata. The submitted copy does not change.\n\n" + built.text
      });
    }
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "report.committee_submitted", subjectType: "building", subjectId: building.id, detail: { month } });
    res.status(201).json({ id, sentTo: emails });
  });

  app.get("/api/buildings/:id/owner-statement", requireUser, (req, res) => {
    const built = statementPack(db, config, req.user, req.params.id, req.query.month);
    if (built.error) return sendError(res, built.status, built.error);
    sendPack(res, built, false);
  });

  app.get("/api/buildings/:id/owner-statement.pdf", requireUser, (req, res) => {
    const built = statementPack(db, config, req.user, req.params.id, req.query.month);
    if (built.error) return sendError(res, built.status, built.error);
    sendPack(res, built, true);
  });

  app.post("/api/buildings/:id/owner-statement/send", requireJson, requireUser, async (req, res) => {
    const building = managedBuilding(db, req.user, req.params.id);
    if (!building) return sendError(res, 404, "That building is not on your account.");
    if (building.world !== "private") return sendError(res, 400, "Owner statements are for a private rental.");
    if (!building.owner_email) return sendError(res, 400, "Add the property owner’s email first.");
    const month = String(req.body?.month || previousMonth(melbourneDay()));
    const built = statementPack(db, config, req.user, building.id, month);
    const id = storeReport(db, { building, kind: "statement", period: month, html: built.html, sentTo: building.owner_email, sentBy: req.user.name });
    await mail.send({ to: building.owner_email, subject: "Owner statement " + month + " — " + building.name, text: built.text });
    res.status(201).json({ id, sentTo: building.owner_email });
  });

  app.get("/api/jobs/:id/job-report", requireUser, (req, res) => {
    const built = jobReportPack(db, req.user, req.params.id);
    if (built.error) return sendError(res, built.status, built.error);
    sendPack(res, built, false);
  });

  app.post("/api/jobs/:id/job-report/send", requireJson, requireUser, async (req, res) => {
    const job = finishedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That finished job is not on your account.");
    if (req.user.role !== "property_manager") return sendError(res, 403, "Job reports to an owner are for a property manager.");
    if (!job.owner_email) return sendError(res, 400, "Add the property owner’s email first.");
    const built = jobReportPack(db, req.user, job.id);
    const id = storeReport(db, {
      building: { id: job.building_id, organisation_id: job.organisation_id },
      kind: "job",
      period: job.id,
      html: built.html,
      sentTo: job.owner_email,
      sentBy: req.user.name
    });
    await mail.send({ to: job.owner_email, subject: "Job report — " + job.title, text: built.text });
    res.status(201).json({ id, sentTo: job.owner_email });
  });

  app.get("/api/reports/submitted/:id", requireUser, (req, res) => {
    const row = db.prepare("SELECT * FROM submitted_reports WHERE id = ? AND organisation_id = ?").get(req.params.id, req.user.organisation_id);
    if (!row || !MANAGER.has(req.user.role)) return sendError(res, 404, "That submitted report is not on your account.");
    res.type("html").send(row.html);
  });
}

function sendPack(res, pack, asPdf) {
  if (pack.error) return res.status(pack.status).json({ error: pack.error });
  if (asPdf) {
    res.setHeader("Content-Type", "application/pdf");
    res.send(buildPdf(pack.lines));
    return;
  }
  res.type("html").send(pack.html);
}

export async function chaseMissingInvoices(db, mail, now = new Date()) {
  const today = melbourneDay(now);
  const rows = db.prepare(`SELECT jobs.*, users.email AS contractor_email FROM jobs
    LEFT JOIN users ON users.id = jobs.contractor_user_id
    WHERE jobs.stage IN ('accepted', 'released') AND jobs.contractor_user_id IS NOT NULL`).all();
  let sent = 0;
  for (const job of rows) {
    const invoice = db.prepare("SELECT 1 AS ok FROM job_invoices WHERE job_id = ? AND status = 'received'").get(job.id);
    if (invoice || !job.contractor_email) continue;
    const started = acceptedOn(db, job);
    if (!started || wholeDays(started, today) < 7) continue;
    const chase = db.prepare("SELECT * FROM invoice_chases WHERE job_id = ?").get(job.id);
    if (chase && wholeDays(chase.last_at.slice(0, 10), today) < 7) continue;
    await mail.send({
      to: job.contractor_email,
      subject: "A reminder to send the invoice for " + (job.work_order || job.title),
      text: `Hello,\n\nThis is a polite reminder to upload the invoice for "${job.title}". The work is finished and the invoice is not in yet.\n\nThe building can still post new jobs. You can still be paid once the invoice is received.\n\nTaskSpeck Strata`
    });
    if (chase) db.prepare("UPDATE invoice_chases SET last_at = ?, count = count + 1 WHERE job_id = ?").run(now.toISOString(), job.id);
    else db.prepare("INSERT INTO invoice_chases (job_id, last_at, count) VALUES (?, ?, 1)").run(job.id, now.toISOString());
    sent += 1;
  }
  return sent;
}

export async function sendScheduledReports(db, mail, now = new Date()) {
  const day = melbourneDay(now);
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const managers = db.prepare("SELECT * FROM users WHERE role IN ('building_manager', 'oc_manager', 'property_manager') AND report_schedule != 'off'").all();
  let sent = 0;
  for (const user of managers) {
    const org = db.prepare("SELECT world FROM organisations WHERE id = ?").get(user.organisation_id);
    const due = user.report_schedule === "monthly" ? day.endsWith("-01")
      : user.report_schedule === "weekly" ? weekday === 1
        : user.report_schedule === "fortnightly" ? weekday === 1 && wholeDays("2026-01-05", day) % 14 === 0
          : false;
    if (!due || user.report_last_on === day) continue;
    const viewer = { ...user, world: org?.world || "" };
    const pack = summaryFor(db, viewer, { kind: user.report_schedule === "monthly" ? "monthly" : user.report_schedule, today: day });
    if (pack.error) continue;
    await mail.send({ to: user.email, subject: pack.title, text: pack.text });
    db.prepare("UPDATE users SET report_last_on = ? WHERE id = ?").run(day, user.id);
    sent += 1;
  }
  return sent;
}

function summaryFor(db, user, query) {
  if (!MANAGER.has(user.role)) return { error: "Only a manager can open reports.", status: 403 };
  const kind = KINDS.includes(query.kind) ? query.kind : "monthly";
  const today = String(query.today || melbourneDay());
  const range = rangeFor(kind, today, query.month);
  const buildings = assignedBuildings(db, user).filter(row => !query.buildingId || row.id === query.buildingId);
  if (query.buildingId && !buildings.length) return { error: "That building is not on your account.", status: 404 };
  const jobs = buildings.flatMap(building => jobsTouching(db, building, range));
  const completed = jobs.filter(job => inRange(job.closed_at, range) || (job.stage === "released" && inRange(job.created_at, range) && !job.closed_at));
  const raised = jobs.filter(job => inRange(job.created_at, range));
  const emergencies = raised.filter(job => job.urgency === "emergency");
  const missing = completed.filter(job => !hasInvoice(db, job.id));
  const spend = completed.reduce((sum, job) => sum + Number(job.approved_cents || 0), 0);
  const label = { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", quarterly: "Quarterly" }[kind];
  const title = label + " summary";
  const lines = [
    title,
    user.organisation_name || user.name,
    range.start + " to " + range.end,
    "Jobs completed: " + completed.length,
    "Requests raised: " + raised.length,
    "Approved spend: " + money(spend),
    "Emergencies: " + emergencies.length,
    "Invoices missing: " + missing.length,
    "",
    "Work completed"
  ];
  if (!completed.length) lines.push("No jobs were completed in this period.");
  for (const job of completed) lines.push(job.title + " · " + job.building_name + " · " + money(job.approved_cents) + (hasInvoice(db, job.id) ? " · Invoice in" : " · No invoice yet"));
  lines.push("", "Print or save as PDF. Amounts are the agreed prices. A late invoice never stops a building from posting a job.");
  const rows = [["Completed date", "Building", "Job", "Work order", "Agreed price", "Invoice"]];
  for (const job of completed) {
    const invoice = db.prepare("SELECT number FROM job_invoices WHERE job_id = ? AND status = 'received' ORDER BY created_at DESC LIMIT 1").get(job.id);
    rows.push([
      (job.closed_at || "").slice(0, 10),
      job.building_name,
      job.title,
      job.work_order || "",
      (Number(job.approved_cents || 0) / 100).toFixed(2),
      invoice ? invoice.number : ""
    ]);
  }
  return { html: page(title, lines), lines, rows, title, text: lines.join("\n"), range };
}

function committeePack(db, user, buildingId, monthValue) {
  const building = managedBuilding(db, user, buildingId);
  if (!building) return { error: "That building is not on your account.", status: 404 };
  if (building.world === "private") return { error: "A private rental uses an owner statement, not a committee report.", status: 400 };
  const month = String(monthValue || previousMonth(melbourneDay()));
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month as YYYY-MM.", status: 400 };
  const range = monthRange(month);
  const jobs = jobsTouching(db, building, range);
  const completed = jobs.filter(job => inRange(job.closed_at, range));
  const lines = [
    "Monthly Maintenance Report",
    building.name,
    month,
    "Prepared by " + user.name,
    "Goes to: " + (building.committee_emails || "no committee emails yet"),
    "Jobs completed: " + completed.length,
    "Approved spend: " + money(completed.reduce((sum, job) => sum + Number(job.approved_cents || 0), 0))
  ];
  if (!completed.length) lines.push("No jobs were completed in this month.");
  for (const job of completed) lines.push(job.title + " · " + (job.work_order || "no work order") + " · " + money(job.approved_cents));
  lines.push("This page can be printed or saved as PDF. The submitted copy stays as it was sent.");
  return { html: page("Monthly Maintenance Report", lines), lines, text: lines.join("\n"), title: "Monthly Maintenance Report" };
}

function statementPack(db, config, user, buildingId, monthValue) {
  const building = managedBuilding(db, user, buildingId);
  if (!building) return { error: "That building is not on your account.", status: 404 };
  if (building.world !== "private") return { error: "Owner statements are for a private rental.", status: 400 };
  const month = String(monthValue || previousMonth(melbourneDay()));
  const range = monthRange(month);
  const settings = moneySettings(db, config);
  const jobs = jobsTouching(db, building, range);
  const completed = jobs.filter(job => inRange(job.closed_at, range));
  const limit = settings.maxPayDays || 14;
  const lines = [
    "Owner statement",
    building.name,
    month,
    "For " + (building.owner_name || "the property owner"),
    "Prepared by " + user.name,
    "Work completed"
  ];
  if (!completed.length) lines.push("No work was completed this month.");
  for (const job of completed) lines.push(job.title + " · " + money(job.approved_cents));
  lines.push("Payment terms are limited to " + limit + " days after the final invoice so the contractor is paid on time.");
  lines.push("This statement is for information. Payments are made in the app.");
  return { html: page("Owner statement", lines), lines, text: lines.join("\n"), title: "Owner statement" };
}

function jobReportPack(db, user, jobId) {
  const job = finishedJob(db, user, jobId);
  if (!job) return { error: "That finished job is not on your account.", status: 404 };
  const invoice = db.prepare("SELECT number, amount_cents FROM job_invoices WHERE job_id = ? AND status = 'received' ORDER BY created_at DESC LIMIT 1").get(job.id);
  const lines = [
    "Job report",
    job.title,
    job.building_name,
    "Prepared by " + user.name + (job.owner_name ? " for " + job.owner_name : ""),
    "Work order: " + (job.work_order || "not issued"),
    "Agreed price: " + money(job.approved_cents),
    invoice ? "Invoice " + invoice.number + " · " + money(invoice.amount_cents) : "Invoice: not received yet",
    "This report was generated from the job record."
  ];
  return { html: page("Job report", lines), lines, text: lines.join("\n"), title: "Job report" };
}

function finishedJob(db, user, id) {
  if (user.role !== "property_manager") return null;
  return db.prepare(`SELECT jobs.*, buildings.name AS building_name, buildings.owner_name, buildings.owner_email, buildings.organisation_id
    FROM jobs JOIN buildings ON buildings.id = jobs.building_id
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE jobs.id = ? AND jobs.organisation_id = ? AND building_assignments.user_id = ?
      AND jobs.stage IN ('accepted', 'released')`).get(id, user.organisation_id, user.id);
}

function jobsTouching(db, building, range) {
  return db.prepare(`SELECT jobs.*, ? AS building_name FROM jobs
    WHERE building_id = ? AND (
      substr(created_at, 1, 10) BETWEEN ? AND ?
      OR (closed_at != '' AND substr(closed_at, 1, 10) BETWEEN ? AND ?)
    )`).all(building.name, building.id, range.start, range.end, range.start, range.end);
}

function hasInvoice(db, jobId) {
  return !!db.prepare("SELECT 1 AS ok FROM job_invoices WHERE job_id = ? AND status = 'received'").get(jobId);
}

function acceptedOn(db, job) {
  const event = db.prepare("SELECT at FROM job_events WHERE job_id = ? AND body LIKE '%accepted%' ORDER BY at ASC LIMIT 1").get(job.id);
  return String(event?.at || job.closed_at || job.created_at || "").slice(0, 10);
}

function assignedBuildings(db, user) {
  return db.prepare(`SELECT buildings.* FROM buildings
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE buildings.organisation_id = ? AND building_assignments.user_id = ? AND buildings.archived = 0`).all(user.organisation_id, user.id);
}

function managedBuilding(db, user, id) {
  if (!MANAGER.has(user.role)) return null;
  return db.prepare(`SELECT buildings.* FROM buildings
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE buildings.id = ? AND buildings.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function submitted(db, buildingId, kind, period) {
  return db.prepare("SELECT id FROM submitted_reports WHERE building_id = ? AND kind = ? AND period = ?").get(buildingId, kind, period);
}

function storeReport(db, { building, kind, period, html, sentTo, sentBy }) {
  const id = newId();
  db.prepare(`INSERT INTO submitted_reports (id, building_id, organisation_id, kind, period, html, sent_to, sent_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, building.id, building.organisation_id, kind, period, html, sentTo, sentBy, new Date().toISOString());
  return id;
}

function melbourneDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function rangeFor(kind, today, month) {
  if (kind === "monthly") return monthRange(String(month || today.slice(0, 7)));
  if (kind === "quarterly") return quarterRange(String(month || today.slice(0, 7)));
  return spanEnding(today, kind === "weekly" ? 7 : 14);
}

function monthRange(month) {
  const [year, mon] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: month + "-01", end: month + "-" + String(end).padStart(2, "0") };
}

function quarterRange(month) {
  const [year, mon] = month.split("-").map(Number);
  const startMonth = Math.floor((mon - 1) / 3) * 3 + 1;
  const start = year + "-" + String(startMonth).padStart(2, "0") + "-01";
  const end = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function monthEnd(month) {
  return monthRange(month).end;
}

function previousMonth(day) {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function spanEnding(day, length) {
  const [year, month, date] = day.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, date));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (length - 1));
  return { start: start.toISOString().slice(0, 10), end: day };
}

function inRange(value, range) {
  const day = String(value || "").slice(0, 10);
  return day.length === 10 && day >= range.start && day <= range.end;
}

function wholeDays(fromDay, toDay) {
  return Math.floor((Date.parse(toDay + "T00:00:00Z") - Date.parse(fromDay + "T00:00:00Z")) / 86400000);
}

function splitEmails(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function page(title, lines) {
  const body = lines.map((line, index) => {
    if (!line) return "";
    if (index === 0) return "<h1>" + esc(line) + "</h1>";
    return "<p>" + esc(line) + "</p>";
  }).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:"Plus Jakarta Sans",sans-serif;margin:32px;color:#15201C}h1{font-size:28px}p{line-height:1.45}@media print{.noprint{display:none}}</style></head>
<body>${body}<p class="noprint"><button onclick="print()">Print or save as PDF</button></p></body></html>`;
}

function csv(rows) {
  return rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function money(cents) {
  return "A$" + (Number(cents || 0) / 100).toFixed(2);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function buildPdf(lines) {
  const text = lines.filter(line => line).slice(0, 42).map((line, index) => "BT /F1 11 Tf 50 " + (800 - index * 16) + " Td (" + pdfSafe(line) + ") Tj ET").join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    "4 0 obj << /Length " + text.length + " >> stream\n" + text + "\nendstream endobj\n",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(out.length);
    out += object;
  }
  const xref = out.length;
  out += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  out += "trailer << /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(out);
}

function pdfSafe(value) {
  return String(value).replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
