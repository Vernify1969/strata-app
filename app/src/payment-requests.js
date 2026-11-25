import { audit } from "./db.js";
import { newId } from "./ids.js";
import { moneySettings, releaseJobPayments, releasePrepaidOnArrival } from "./payments.js";
import { feeOfCents } from "./rules.js";
import { liveKeyProblem } from "./security-gate.js";

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);

export function registerPaymentRequestRoutes(app, { db, config, mail, sendError, requireUser, requireJson }) {
  app.post("/api/jobs/:id/payment-requests", requireJson, requireUser, (req, res) => {
    const job = managedJob(db, req.user, req.params.id);
    if (!job || !job.work_order || !job.approved_cents) return sendError(res, 404, "That job is not ready for a payment request.");
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const settings = moneySettings(db, config);
    const count = db.prepare("SELECT COUNT(*) AS n FROM payment_requests WHERE job_id = ?").get(job.id).n + 1;
    const number = "PR-" + job.work_order.replace(/^WO-/, "") + "-" + count;
    const paid = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payment_requests WHERE job_id = ? AND status = 'paid'").get(job.id).n;
    const remaining = Math.max(0, job.approved_cents - paid);
    if (!remaining) return sendError(res, 400, "Nothing more is due on this job.");
    const kind = req.body?.kind === "deposit" || (job.needs_prepay && paid === 0) ? "deposit" : "final";
    const quote = db.prepare("SELECT deposit_cents FROM quotes WHERE id = ?").get(job.awarded_quote_id);
    const amount = kind === "deposit" ? Math.min(remaining, quote?.deposit_cents || remaining) : remaining;
    const due = kind === "deposit"
      ? new Date(Date.now() + settings.depositHours * 3600 * 1000).toISOString().slice(0, 10)
      : addDays(new Date().toISOString().slice(0, 10), Number(building.payment_terms_days || settings.maxPayDays));
    const id = newId();
    db.prepare(`INSERT INTO payment_requests (id, job_id, number, kind, amount_cents, due_on, payer_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, job.id, number, kind, amount, due, payerEmail(building, req.user), new Date().toISOString());
    addEvent(db, job.id, req.user.name, "Payment request " + number + " prepared.");
    res.status(201).json(publicRequest(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id)));
  });

  app.post("/api/jobs/:id/payment-requests/:requestId/send", requireJson, requireUser, async (req, res) => {
    const job = managedJob(db, req.user, req.params.id);
    const row = job && db.prepare("SELECT * FROM payment_requests WHERE id = ? AND job_id = ?").get(req.params.requestId, job.id);
    if (!row) return sendError(res, 404, "That payment request is not on this job.");
    if (row.status === "paid" || row.status === "refunded") return sendError(res, 400, "That payment request is already finished.");
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const to = payerEmail(building, req.user);
    const again = row.status === "sent" || row.status === "failed";
    await mail.send({
      to,
      subject: (again ? "Payment request sent again: " : "Payment request ") + row.number,
      text: `Please pay ${money(row.amount_cents)} for ${job.title}. Payment request ${row.number}. Due ${row.due_on}. Pay only through the app. TaskSpeck Strata does not send bank details.`
    });
    db.prepare("UPDATE payment_requests SET status = 'sent', payer_email = ?, sent_at = ?, failure_reason = '' WHERE id = ?").run(to, new Date().toISOString(), row.id);
    addEvent(db, job.id, req.user.name, (again ? "Sent payment request again: " : "Sent payment request ") + row.number + ".");
    res.json(publicRequest(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(row.id)));
  });

  app.post("/api/jobs/:id/payment-requests/:requestId/pay", requireJson, requireUser, async (req, res) => {
    const job = managedJob(db, req.user, req.params.id);
    const row = job && db.prepare("SELECT * FROM payment_requests WHERE id = ? AND job_id = ?").get(req.params.requestId, job.id);
    if (!row) return sendError(res, 404, "That payment request is not on this job.");
    const key = String(req.body?.idempotencyKey || "");
    if (key.length < 8) return sendError(res, 400, "Send an idempotency key so a repeated tap cannot charge twice.");
    const existing = db.prepare("SELECT * FROM payments WHERE idempotency_key = ?").get(key);
    if (existing) return res.json({ ...publicPayment(existing), request: publicRequest(row), repeated: true });
    if (row.status === "paid") return sendError(res, 400, "That payment request is already paid.");
    const settings = moneySettings(db, config);
    const fail = req.body?.outcome === "fail";
    const live = liveKeyProblem(config.stripeSecretKey, config.stripePublishableKey);
    if (live) return sendError(res, 400, live);
    const split = feeOfCents(row.amount_cents, settings.commissionPercent, settings.gstOnFee);
    const id = newId();
    const now = new Date().toISOString();
    const releaseOn = row.kind === "final" ? "complete" : "arrival";
    const simulate = fail || !!config.demoMode || !config.stripeSecretKey;
    let providerRef = "test_" + id;
    let status = fail ? "failed" : "succeeded";
    if (!simulate) {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeSecretKey);
      const intent = await stripe.paymentIntents.create({
        amount: row.amount_cents,
        currency: "aud",
        transfer_group: job.id,
        metadata: { jobId: job.id, paymentId: id, requestId: row.id }
      }, { idempotencyKey: key });
      providerRef = intent.id;
      status = "requires_payment";
    }
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at, kind, urgent_fee_cents, authorize_expires_at, release_on, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'stripe', ?, ?, 0, ?, ?, ?)`).run(
      id, job.id, job.organisation_id, row.amount_cents, split.fee + split.gst, split.net,
      status, key, providerRef, now, row.kind, now, releaseOn, fail ? "The card was declined." : ""
    );
    if (fail) {
      db.prepare("UPDATE payment_requests SET status = 'failed', failure_reason = ?, payment_id = ? WHERE id = ?").run("The card was declined.", id, row.id);
      addEvent(db, job.id, req.user.name, "Payment failed for " + row.number + ". Nothing was taken. You can try again.");
      return res.status(402).json({ failed: true, reason: "The card was declined.", request: publicRequest(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(row.id)), repeated: false });
    }
    if (status !== "succeeded") {
      db.prepare("UPDATE payment_requests SET payment_id = ? WHERE id = ?").run(id, row.id);
      addEvent(db, job.id, req.user.name, "Payment started for " + row.number + ". Stripe has not confirmed it yet.");
      return res.status(201).json({ ...publicPayment(db.prepare("SELECT * FROM payments WHERE id = ?").get(id)), request: publicRequest(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(row.id)), repeated: false });
    }
    db.prepare("UPDATE payment_requests SET status = 'paid', paid_at = ?, payment_id = ?, failure_reason = '' WHERE id = ?").run(now, id, row.id);
    if (row.kind !== "final" && job.stage === "approved") db.prepare("UPDATE jobs SET stage = 'paid' WHERE id = ?").run(job.id);
    const freshJob = db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id);
    if (freshJob.arrival_confirmed === 1) await releasePrepaidOnArrival(db, config, freshJob);
    addEvent(db, job.id, req.user.name, "Payment received for " + row.number + ".");
    res.status(201).json({ ...publicPayment(db.prepare("SELECT * FROM payments WHERE id = ?").get(id)), request: publicRequest(db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(row.id)), repeated: false });
  });

  app.post("/api/jobs/:id/close", requireJson, requireUser, async (req, res) => {
    const job = managedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const ready = closeReady(db, job);
    if (!ready.ok) return sendError(res, 400, ready.reason);
    db.prepare("UPDATE jobs SET closed_at = ?, stage = 'released' WHERE id = ?").run(new Date().toISOString(), job.id);
    await releaseJobPayments(db, config, db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id));
    addEvent(db, job.id, req.user.name, "Job closed. The quote, work order, invoice and payments stay on the record.");
    res.json({ closed: true });
  });

  app.post("/api/owner/payments/:id/refund", requireJson, requireUser, async (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can refund a payment.");
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.id);
    if (!payment || payment.status === "failed") return sendError(res, 404, "That payment cannot be refunded.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return sendError(res, 400, "Add a short reason.");
    const left = payment.amount_cents - Number(payment.refunded_cents || 0);
    const amount = req.body?.amountCents == null ? left : Number(req.body.amountCents);
    if (!Number.isInteger(amount) || amount < 1 || amount > left) return sendError(res, 400, "The refund is a whole number of cents, up to what is still paid.");
    const full = amount === left;
    if (config.stripeSecretKey && String(payment.provider_ref || "").startsWith("pi_") && !liveKeyProblem(config.stripeSecretKey, config.stripePublishableKey)) {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeSecretKey);
      await stripe.refunds.create({ payment_intent: payment.provider_ref, amount });
    }
    db.prepare("UPDATE payments SET refunded_cents = refunded_cents + ?, status = ? WHERE id = ?").run(amount, full ? "refunded" : payment.status, payment.id);
    if (payment.id) {
      const request = db.prepare("SELECT * FROM payment_requests WHERE payment_id = ?").get(payment.id);
      if (request && full) db.prepare("UPDATE payment_requests SET status = 'refunded' WHERE id = ?").run(request.id);
    }
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: full ? "payment.refunded" : "payment.refunded_partial", subjectType: "payment", subjectId: payment.id, detail: { amount, reason } });
    res.json({ refundedCents: amount, full, remainingCents: left - amount });
  });

  app.post("/api/owner/payments/:id/dispute", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can record a dispute.");
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.id);
    if (!payment) return sendError(res, 404, "That payment is not on record.");
    const status = ["open", "won", "lost"].includes(req.body?.status) ? req.body.status : "";
    if (!status) return sendError(res, 400, "A dispute is open, won, or lost.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return sendError(res, 400, "Add a short reason. TaskSpeck does not decide who is right.");
    const pause = status !== "won";
    db.prepare("UPDATE payments SET dispute_status = ?, payout_paused = ?, payout_pause_reason = ? WHERE id = ?").run(
      status, pause ? 1 : 0, pause ? reason : "", payment.id
    );
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "payment.dispute", subjectType: "payment", subjectId: payment.id, detail: { status, reason } });
    res.json({ dispute: status, payoutPaused: pause });
  });
}

export function listOverdue(db, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return db.prepare(`SELECT payment_requests.*, jobs.title AS job_title, buildings.name AS building_name, buildings.id AS building_id
    FROM payment_requests
    JOIN jobs ON jobs.id = payment_requests.job_id
    JOIN buildings ON buildings.id = jobs.building_id
    WHERE payment_requests.status = 'sent' AND payment_requests.due_on != '' AND payment_requests.due_on < ?
    ORDER BY payment_requests.due_on`).all(today).map(row => ({
    id: row.id,
    number: row.number,
    jobId: row.job_id,
    jobTitle: row.job_title,
    buildingId: row.building_id,
    buildingName: row.building_name,
    amountCents: row.amount_cents,
    dueOn: row.due_on,
    payerEmail: row.payer_email,
    reminders: row.reminders,
    daysOverdue: wholeDays(row.due_on, today)
  }));
}

export async function chaseOverdueRequests(db, mail, config, now = new Date()) {
  const settings = moneySettings(db, config);
  const every = Math.max(1, Number(settings.reminderEveryDays) || 7);
  const today = now.toISOString().slice(0, 10);
  const rows = db.prepare("SELECT * FROM payment_requests WHERE status = 'sent' AND due_on != '' AND due_on <= ?").all(today);
  let reminded = 0;
  for (const row of rows) {
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.job_id);
    if (!job) continue;
    const first = Number(row.reminders || 0) === 0;
    const since = row.last_reminded_at ? wholeDays(row.last_reminded_at.slice(0, 10), today) : every;
    if (!first && since < every) continue;
    const text = `Hello,\n\nThis is a polite reminder about payment request ${row.number} for "${job.title}". It was due on ${row.due_on}. The amount is ${money(row.amount_cents)}.\n\nPlease pay it in the app when you can. New jobs for the building can still be posted.\n\nTaskSpeck Strata`;
    if (row.payer_email) {
      await mail.send({
        to: row.payer_email,
        subject: "A reminder about " + row.number,
        text
      });
    }
    db.prepare("UPDATE payment_requests SET reminders = reminders + 1, last_reminded_at = ? WHERE id = ?").run(now.toISOString(), row.id);
    reminded += 1;
  }
  return reminded;
}

function wholeDays(fromDay, toDay) {
  const from = Date.parse(fromDay + "T00:00:00Z");
  const to = Date.parse(toDay + "T00:00:00Z");
  return Math.floor((to - from) / (24 * 3600 * 1000));
}

function payerEmail(building, user) {
  if (building?.payment_email) return building.payment_email;
  return user.email || "";
}

function managedJob(db, user, id) {
  if (!MANAGER.has(user.role)) return null;
  return db.prepare(`SELECT jobs.* FROM jobs
    JOIN building_assignments ON building_assignments.building_id = jobs.building_id
    WHERE jobs.id = ? AND jobs.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function publicRequest(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    number: row.number,
    kind: row.kind,
    amountCents: row.amount_cents,
    dueOn: row.due_on,
    status: row.status,
    payerEmail: row.payer_email,
    failureReason: row.failure_reason || "",
    paid: row.status === "paid"
  };
}

function publicPayment(row) {
  return { id: row.id, status: row.status, amountCents: row.amount_cents, failed: row.status === "failed", paid: row.status === "succeeded" };
}

export function closeReady(db, job) {
  if (job.closed_at) return { ok: false, reason: "This job is already closed." };
  const invoice = db.prepare("SELECT status FROM job_invoices WHERE job_id = ? ORDER BY created_at DESC LIMIT 1").get(job.id);
  if (!invoice || invoice.status !== "received") return { ok: false, reason: "A received invoice is needed before the job can close." };
  const open = db.prepare("SELECT COUNT(*) AS n FROM payment_requests WHERE job_id = ? AND status IN ('draft', 'sent', 'failed')").get(job.id).n;
  if (open) return { ok: false, reason: "A payment request is still open." };
  if (!["accepted", "released"].includes(job.stage)) return { ok: false, reason: "The work is not ready to close." };
  return { ok: true, reason: "" };
}

function addEvent(db, jobId, actor, body) {
  db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(jobId, new Date().toISOString(), actor, body);
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(cents) {
  return "A$" + (Number(cents || 0) / 100).toFixed(2);
}
