import { audit } from "./db.js";
import { newId } from "./ids.js";
import { feeOfCents } from "./rules.js";
import { liveKeyProblem, securityGateOpen } from "./security-gate.js";

export function cleanDesignTheme(value, fallback = "clear") {
  return value === "warm" || value === "modern" || value === "clear" ? value : fallback;
}

export function moneySettings(db, config = {}) {
  const row = db.prepare("SELECT * FROM platform_settings WHERE id = 'main'").get();
  if (row) {
    return {
      commissionPercent: row.commission_percent,
      urgentFeeCents: row.urgent_fee_cents,
      apartmentFeeCents: row.apartment_fee_cents,
      apartmentFeeEnabled: row.apartment_fee_enabled === 1,
      depositHours: Number(row.deposit_hours || 48),
      urgentDepositHours: Number(row.urgent_deposit_hours || 12),
      aiCapCents: row.ai_cap_cents == null ? 500 : Number(row.ai_cap_cents),
      contractorAiCapCents: row.contractor_ai_cap_cents == null ? 200 : Number(row.contractor_ai_cap_cents),
      assistantName: row.assistant_name || "Chloe",
      assistantGreeting: row.assistant_greeting || "Hi, I'm {name}, your AI assistant. How can I help you today?",
      assistantTone: row.assistant_tone || "friendly",
      webSearchEnabled: row.web_search_enabled == null ? true : row.web_search_enabled === 1,
      reminderCheckHours: row.reminder_check_hours == null ? 3 : Number(row.reminder_check_hours),
      designTheme: cleanDesignTheme(row.design_theme),
      minCoverCents: row.min_cover_cents == null ? 2000000000 : Number(row.min_cover_cents)
    };
  }
  return {
    commissionPercent: Number(config.commissionPercent ?? 15),
    urgentFeeCents: Number(config.urgentFeeCents ?? 2500),
    apartmentFeeCents: Number(config.apartmentFeeCents ?? 0),
    apartmentFeeEnabled: !!config.apartmentFeeEnabled,
    depositHours: Number(config.depositHours ?? 48),
    urgentDepositHours: Number(config.urgentDepositHours ?? 12),
    aiCapCents: Number(config.aiCapCents ?? 500),
    contractorAiCapCents: Number(config.contractorAiCapCents ?? 200),
    assistantName: config.assistantName || "Chloe",
    assistantGreeting: config.assistantGreeting || "Hi, I'm {name}, your AI assistant. How can I help you today?",
    assistantTone: config.assistantTone || "friendly",
    webSearchEnabled: config.webSearchEnabled !== false,
    reminderCheckHours: Number(config.reminderCheckHours ?? 3),
    designTheme: cleanDesignTheme(config.designTheme),
    minCoverCents: Number(config.minCoverCents ?? 2000000000)
  };
}

export function ensureMoneySettings(db, config = {}) {
  if (db.prepare("SELECT id FROM platform_settings WHERE id = 'main'").get()) return;
  const settings = moneySettings(db, config);
  db.prepare(`INSERT INTO platform_settings (id, commission_percent, urgent_fee_cents, apartment_fee_cents, apartment_fee_enabled)
    VALUES ('main', ?, ?, ?, ?)`).run(settings.commissionPercent, settings.urgentFeeCents, settings.apartmentFeeCents, settings.apartmentFeeEnabled ? 1 : 0);
}

export function registerPaymentRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  app.post("/api/jobs/:id/payments", requireJson, requireUser, async (req, res) => {
    if (config.demoMode && (config.stripeSecretKey || config.stripePublishableKey)) {
      return sendError(res, 400, "Demo mode does not use Stripe keys.");
    }
    const problem = liveKeyProblem(config.stripeSecretKey, config.stripePublishableKey);
    if (problem) return sendError(res, 400, problem);
    if (!config.demoMode && !securityGateOpen(config)) return sendError(res, 403, "Payments stay off until the security tests pass.");
    const job = db.prepare(`SELECT jobs.* FROM jobs
      JOIN building_assignments ON building_assignments.building_id = jobs.building_id
      WHERE jobs.id = ? AND jobs.organisation_id = ? AND building_assignments.user_id = ?`).get(req.params.id, req.user.organisation_id, req.user.id);
    if (!job || !job.approved_cents) return sendError(res, 404, "That job is not ready for a payment.");
    if (job.needs_prepay !== 1 && job.stage !== "accepted") {
      return sendError(res, 400, "Nothing is due before the work, unless the approved quote asked for a deposit.");
    }
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(job.awarded_quote_id);
    const settings = moneySettings(db, config);
    const paidSoFar = db.prepare("SELECT COALESCE(SUM(amount_cents - urgent_fee_cents), 0) AS n FROM payments WHERE job_id = ? AND status = 'succeeded'").get(job.id).n;
    const jobPart = job.needs_prepay && paidSoFar === 0 ? (quote?.deposit_cents || job.approved_cents) : Math.max(0, (job.approved_cents || 0) - paidSoFar);
    if (!jobPart) return sendError(res, 400, "Nothing more is due on this job.");
    const urgent = (job.urgency === "urgent" || job.urgency === "after_hours") && paidSoFar === 0 ? settings.urgentFeeCents : 0;
    const split = feeOfCents(jobPart, settings.commissionPercent, false);
    const fee = split.fee + urgent;
    const amount = jobPart + urgent;
    const net = amount - fee;
    const kind = job.needs_prepay && paidSoFar === 0 && jobPart < job.approved_cents ? "deposit" : (paidSoFar > 0 ? "final" : "full");
    const key = String(req.body?.idempotencyKey || "");
    if (key.length < 8) return sendError(res, 400, "Send an idempotency key so a repeated tap cannot charge twice.");
    const existing = db.prepare("SELECT * FROM payments WHERE idempotency_key = ?").get(key);
    if (existing) return res.json(publicPayment(existing));
    const id = newId();
    const now = new Date().toISOString();
    let providerRef = "test_" + id;
    let simulated = false;
    if (config.demoMode) {
      simulated = true;
    } else if (config.stripeSecretKey) {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeSecretKey);
      const contractor = db.prepare("SELECT stripe_account_id FROM users WHERE id = ?").get(job.contractor_user_id);
      if (!contractor?.stripe_account_id) return sendError(res, 400, "The contractor has not finished Stripe Connect in test mode.");
      // Separate charge. The contractor is not paid yet. The transfer happens when the manager marks the job complete.
      // TODO(owner): refunds and disputes are not built. Do not refund this charge until that decision is made.
      const intent = await stripe.paymentIntents.create({
        amount,
        currency: "aud",
        capture_method: "manual",
        transfer_group: job.id,
        metadata: { jobId: job.id, paymentId: id, feeCents: String(fee) }
      }, { idempotencyKey: key });
      providerRef = intent.id;
    }
    const status = simulated ? "succeeded" : "requires_payment";
    const authorizeExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at, kind, urgent_fee_cents, authorize_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'stripe', ?, ?, ?, ?)`).run(
      id, job.id, job.organisation_id, amount, fee, net, status, key, providerRef, now, kind, urgent, authorizeExpires
    );
    if (simulated && job.needs_prepay && job.stage === "approved") {
      db.prepare("UPDATE jobs SET stage = 'paid' WHERE id = ?").run(job.id);
    }
    audit(db, { actorId: req.user.id, organisationId: job.organisation_id, action: simulated ? "payment.simulated" : "payment.created", subjectType: "payment", subjectId: id, detail: { holder: "stripe", amount, simulated } });
    const body = publicPayment(db.prepare("SELECT * FROM payments WHERE id = ?").get(id));
    body.simulated = simulated;
    res.status(201).json(body);
  });

  app.post("/api/jobs/:id/release", requireJson, requireUser, async (req, res) => {
    if (!["building_manager", "oc_manager", "property_manager"].includes(req.user.role)) {
      return sendError(res, 403, "Only the manager can release the contractor's share.");
    }
    const job = db.prepare(`SELECT jobs.* FROM jobs
      JOIN building_assignments ON building_assignments.building_id = jobs.building_id
      WHERE jobs.id = ? AND jobs.organisation_id = ? AND building_assignments.user_id = ?`).get(req.params.id, req.user.organisation_id, req.user.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    if (job.stage !== "accepted") return sendError(res, 400, "The contractor is not paid until you mark the job complete.");
    const held = await releaseJobPayments(db, config, job);
    if (!held.length) {
      const waiting = db.prepare("SELECT 1 AS ok FROM payments WHERE job_id = ? AND status IN ('requires_payment', 'requires_capture') AND released_at = ''").get(job.id);
      return sendError(res, 400, waiting ? "Stripe has not confirmed the capture yet. The contractor is not paid." : "There is no held payment to release.");
    }
    db.prepare("UPDATE jobs SET stage = 'released' WHERE id = ?").run(job.id);
    audit(db, { actorId: req.user.id, organisationId: job.organisation_id, action: "payment.released", subjectType: "job", subjectId: job.id, detail: { count: held.length } });
    res.json({ released: true, payments: held.map(row => publicPayment(db.prepare("SELECT * FROM payments WHERE id = ?").get(row.id))) });
  });

  app.post("/api/me/connect", requireJson, requireUser, async (req, res) => {
    if (req.user.role !== "contractor") return sendError(res, 403, "Only a contractor connects Stripe.");
    const problem = liveKeyProblem(config.stripeSecretKey, config.stripePublishableKey);
    if (problem) return sendError(res, 400, problem);
    if (config.demoMode || !config.stripeSecretKey) {
      const accountId = "acct_test_" + req.user.id.slice(0, 12);
      db.prepare("UPDATE users SET stripe_account_id = ? WHERE id = ?").run(accountId, req.user.id);
      return res.json({ accountId, simulated: true, message: "Test mode. No live Stripe account was created." });
    }
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(config.stripeSecretKey);
    const account = await stripe.accounts.create({ type: "express", country: "AU", capabilities: { card_payments: { requested: true }, transfers: { requested: true } } });
    db.prepare("UPDATE users SET stripe_account_id = ? WHERE id = ?").run(account.id, req.user.id);
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: config.publicBaseUrl + "/profile",
      return_url: config.publicBaseUrl + "/profile",
      type: "account_onboarding"
    });
    res.json({ accountId: account.id, url: link.url, simulated: false });
  });

}

const DAY_MS = 24 * 3600 * 1000;

export function holdAction(payment, nowMs = Date.now()) {
  if (!payment || payment.released_at || payment.status === "succeeded" || payment.status === "failed") return "none";
  const expires = Date.parse(payment.authorize_expires_at || "");
  if (!Number.isFinite(expires)) return "none";
  if (expires - nowMs <= DAY_MS) return "capture";
  return "none";
}

export async function requestCapture(db, config, payment) {
  if (!payment || payment.status === "succeeded" || payment.status === "failed" || payment.capture_requested_at) return;
  db.prepare("UPDATE payments SET capture_requested_at = ? WHERE id = ?").run(new Date().toISOString(), payment.id);
  if (typeof config.capturePayment === "function") {
    await config.capturePayment(payment);
    return;
  }
  if (!config.stripeSecretKey || !String(payment.provider_ref || "").startsWith("pi_")) return;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(config.stripeSecretKey);
  await stripe.paymentIntents.capture(payment.provider_ref);
}

export async function releaseJobPayments(db, config, job) {
  const waiting = db.prepare("SELECT * FROM payments WHERE job_id = ? AND status IN ('requires_payment', 'requires_capture') AND released_at = ''").all(job.id);
  for (const payment of waiting) await requestCapture(db, config, payment);
  const held = db.prepare("SELECT * FROM payments WHERE job_id = ? AND status = 'succeeded' AND released_at = '' AND payout_paused = 0").all(job.id);
  if (!held.length) return [];
  const contractor = db.prepare("SELECT stripe_account_id FROM users WHERE id = ?").get(job.contractor_user_id);
  const now = new Date().toISOString();
  for (const payment of held) {
    let transferRef = "tr_test_" + payment.id;
    if (config.stripeSecretKey && contractor?.stripe_account_id) {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeSecretKey);
      const transfer = await stripe.transfers.create({
        amount: payment.net_cents,
        currency: "aud",
        destination: contractor.stripe_account_id,
        transfer_group: job.id,
        metadata: { paymentId: payment.id }
      });
      transferRef = transfer.id;
    }
    db.prepare("UPDATE payments SET released_at = ?, transfer_ref = ? WHERE id = ?").run(now, transferRef, payment.id);
  }
  return held;
}

export async function captureExpiringHolds(db, config, now = new Date()) {
  const rows = db.prepare(`SELECT * FROM payments
    WHERE status IN ('requires_payment', 'requires_capture') AND released_at = '' AND authorize_expires_at != ''`).all();
  let count = 0;
  for (const payment of rows) {
    if (holdAction(payment, now.getTime()) !== "capture") continue;
    await requestCapture(db, config, payment);
    count += 1;
  }
  return count;
}

export async function handleStripeWebhook(req, res, { db, config }) {
  const secret = config.stripeWebhookSecret || "";
  if (!secret) {
    console.warn("Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not set.");
    res.status(400).json({ error: "The payment notice could not be verified." });
    return;
  }
  if (liveKeyProblem(config.stripeSecretKey, config.stripePublishableKey)) {
    res.status(400).json({ error: "Live Stripe keys are refused." });
    return;
  }
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(config.stripeSecretKey || "sk_test_webhook_only");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature") || "", secret);
  } catch {
    res.status(400).json({ error: "The payment notice could not be verified." });
    return;
  }
  const intent = event.data?.object || {};
  const paymentId = intent.metadata?.paymentId || "";
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  if (!payment) {
    res.status(404).json({ error: "That payment is not known." });
    return;
  }
  if (event.type === "payment_intent.payment_failed") {
    db.prepare("UPDATE payments SET status = 'failed', failure_reason = ? WHERE id = ?").run(
      String(intent.last_payment_error?.message || "The card was declined."), payment.id
    );
  } else if (event.type === "payment_intent.amount_capturable_updated" && Number(intent.amount_capturable || 0) > 0) {
    db.prepare("UPDATE payments SET status = 'requires_capture', provider_ref = ? WHERE id = ?").run(String(intent.id || payment.provider_ref), payment.id);
  } else if (event.type === "payment_intent.succeeded") {
    const confirmedAt = new Date().toISOString();
    db.prepare("UPDATE payments SET status = 'succeeded', captured_at = ?, funds_confirmed_at = ?, provider_ref = ? WHERE id = ?").run(
      confirmedAt, confirmedAt, String(intent.id || payment.provider_ref), payment.id
    );
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(payment.job_id);
    if (job && job.needs_prepay && job.stage === "approved") {
      db.prepare("UPDATE jobs SET stage = 'paid' WHERE id = ?").run(job.id);
    }
    if (!payment.funds_confirmed_at && job?.contractor_user_id && config.mail) {
      const contractor = db.prepare("SELECT email FROM users WHERE id = ?").get(job.contractor_user_id);
      if (contractor?.email) {
        await config.mail.send({
          to: contractor.email,
          subject: "Funds secured by Stripe",
          text: "Funds secured by Stripe – OK to start.\n\nThe deposit for \"" + job.title + "\" is held. You can start the work."
        });
      }
    }
  } else {
    res.json({ ok: true, ignored: true });
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
    paid: row.status === "succeeded",
    released: !!row.released_at,
    kind: row.kind || "full",
    urgentFeeCents: row.urgent_fee_cents || 0
  };
}
