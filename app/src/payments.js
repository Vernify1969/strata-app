import { createHmac, timingSafeEqual } from "node:crypto";
import { audit } from "./db.js";
import { newId } from "./ids.js";
import { feeOfCents } from "./rules.js";
import { liveKeyProblem, securityGateOpen } from "./security-gate.js";

export function registerPaymentRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  app.post("/api/jobs/:id/payments", requireJson, requireUser, async (req, res) => {
    const problem = liveKeyProblem(config.stripeSecretKey, config.stripePublishableKey);
    if (problem) return sendError(res, 400, problem);
    if (!securityGateOpen(config)) return sendError(res, 403, "Payments stay off until the security tests pass.");
    const job = db.prepare(`SELECT jobs.* FROM jobs
      JOIN building_assignments ON building_assignments.building_id = jobs.building_id
      WHERE jobs.id = ? AND jobs.organisation_id = ? AND building_assignments.user_id = ?`).get(req.params.id, req.user.organisation_id, req.user.id);
    if (!job || !job.approved_cents) return sendError(res, 404, "That job is not ready for a payment.");
    if (job.needs_prepay !== 1 && job.stage !== "accepted") {
      return sendError(res, 400, "Nothing is due before the work, unless the approved quote asked for a deposit.");
    }
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(job.awarded_quote_id);
    const amount = job.needs_prepay ? (quote?.deposit_cents || job.approved_cents) : job.approved_cents;
    const split = feeOfCents(amount, 15, false);
    const key = String(req.body?.idempotencyKey || "");
    if (key.length < 8) return sendError(res, 400, "Send an idempotency key so a repeated tap cannot charge twice.");
    const existing = db.prepare("SELECT * FROM payments WHERE idempotency_key = ?").get(key);
    if (existing) return res.json(publicPayment(existing));
    const id = newId();
    const now = new Date().toISOString();
    let providerRef = "test_" + id;
    if (config.stripeSecretKey) {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeSecretKey);
      const contractor = db.prepare("SELECT stripe_account_id FROM users WHERE id = ?").get(job.contractor_user_id);
      if (!contractor?.stripe_account_id) return sendError(res, 400, "The contractor has not finished Stripe Connect in test mode.");
      const intent = await stripe.paymentIntents.create({
        amount,
        currency: "aud",
        application_fee_amount: split.fee,
        transfer_data: { destination: contractor.stripe_account_id },
        capture_method: job.needs_prepay ? "manual" : "automatic",
        metadata: { jobId: job.id, paymentId: id }
      }, { idempotencyKey: key });
      providerRef = intent.id;
    }
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'requires_payment', ?, ?, 'stripe', ?)`).run(
      id, job.id, job.organisation_id, amount, split.fee, split.net, key, providerRef, now
    );
    audit(db, { actorId: req.user.id, organisationId: job.organisation_id, action: "payment.created", subjectType: "payment", subjectId: id, detail: { holder: "stripe", amount } });
    res.status(201).json(publicPayment(db.prepare("SELECT * FROM payments WHERE id = ?").get(id)));
  });

}

export function handleStripeWebhook(req, res, { db, config }) {
  let event = {};
  try {
    const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    event = JSON.parse(text || "{}");
  } catch {
    res.status(400).json({ error: "The payment notice could not be read." });
    return;
  }
  const secret = config.stripeWebhookSecret || "test-webhook";
  const canonical = [event.id, event.type, event.paymentId, event.status].join("|");
  const given = String(req.get("x-strata-signature") || "");
  const expected = createHmac("sha256", secret).update(canonical).digest("hex");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(400).json({ error: "The payment notice could not be verified." });
    return;
  }
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(event.paymentId);
  if (!payment) {
    res.status(404).json({ error: "That payment is not known." });
    return;
  }
  if (event.type === "payment_failed") {
    db.prepare("UPDATE payments SET status = 'failed', failure_reason = ? WHERE id = ?").run(String(event.reason || "The card was declined."), payment.id);
  } else if (event.type === "payment_succeeded") {
    db.prepare("UPDATE payments SET status = 'succeeded', provider_ref = COALESCE(?, provider_ref) WHERE id = ?").run(event.providerRef ? String(event.providerRef) : null, payment.id);
  } else {
    res.status(400).json({ error: "That payment notice is not used." });
    return;
  }
  audit(db, { actorId: null, organisationId: payment.organisation_id, action: "payment.event", subjectType: "payment", subjectId: payment.id, detail: { type: event.type } });
  res.json({ ok: true, status: db.prepare("SELECT status FROM payments WHERE id = ?").get(payment.id).status });
}

function publicPayment(row) {
  return {
    id: row.id,
    status: row.status,
    amountCents: row.amount_cents,
    feeCents: row.fee_cents,
    netCents: row.net_cents,
    holder: "stripe",
    providerRef: row.provider_ref,
    paid: row.status === "succeeded"
  };
}
