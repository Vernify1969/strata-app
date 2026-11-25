import { audit } from "./db.js";
import { complianceBlock } from "./documents.js";
import { centreOf } from "./area.js";
import { abnOk, newId } from "./ids.js";
import { moneySettings, requestCapture } from "./payments.js";
import { closeReady } from "./payment-requests.js";
import { deliverNotice } from "./notify.js";
import { takeNumber } from "./job-papers.js";
import { approvalFor, depositAllowed, depositCents, hasContact, invoiceDecision, reviewEndsAt } from "./rules.js";

// TODO(owner): the Strata administrator role is not defined, so it is not a role in this app.

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);
const NO_STRIKE = new Set(["The site was unsafe", "The manager changed the job or the access"]);

export function registerJobRoutes(app, { db, config = {}, mail, sendError, requireUser, requireJson }) {
  app.patch("/api/me/work", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "contractor") return sendError(res, 403, "Only a contractor sets trades and a work postcode.");
    const trades = Array.isArray(req.body?.trades) ? req.body.trades.map(String) : [];
    const postcode = String(req.body?.basePostcode || "");
    if (!trades.length) return sendError(res, 400, "Choose at least one trade.");
    if (!/^\d{4}$/.test(postcode)) return sendError(res, 400, "Add the postcode you work from.");
    db.prepare("UPDATE users SET trades = ?, base_postcode = ?, gst_registered = ? WHERE id = ?").run(
      JSON.stringify(trades), postcode, req.body?.gst === false ? 0 : 1, req.user.id
    );
    res.json({ ok: true });
  });

  app.get("/api/jobs", requireUser, (req, res) => {
    res.json(workspace(db, req.user, String(req.query.q || "")));
  });

  app.get("/api/jobs/:id", requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const pack = workspace(db, req.user);
    res.json({
      job: pack.jobs.find(item => item.id === job.id),
      quotes: pack.quotes.filter(item => item.jobId === job.id)
    });
  });

  app.post("/api/jobs", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager can post a job.");
    if (!req.user.consent || !abnOk(req.user.abn) || !req.user.business_name) {
      return sendError(res, 400, "Finish your profile before you send a request.");
    }
    const building = db.prepare(`SELECT buildings.* FROM buildings
      JOIN building_assignments ON building_assignments.building_id = buildings.id
      WHERE buildings.id = ? AND buildings.organisation_id = ? AND building_assignments.user_id = ? AND buildings.archived = 0`)
      .get(req.body?.buildingId, req.user.organisation_id, req.user.id);
    if (!building) return sendError(res, 404, "That building is not on your account.");
    if (building.payments_paused) return sendError(res, 400, "Payments for this building are overdue. New jobs are paused until they are paid.");
    const served = db.prepare("SELECT postcode FROM service_postcodes WHERE postcode = ?").get(building.postcode);
    if (!served) return sendError(res, 400, "We do not cover this area yet.");
    const title = String(req.body?.title || "").trim();
    const area = String(req.body?.area || "").trim();
    if (title.length < 2 || area.length < 2) return sendError(res, 400, "Add a title and the place in the building.");
    const id = newId();
    const now = new Date().toISOString();
    const payload = {
      safety: req.body?.safety || [],
      photos: Number(req.body?.photoCount || 0),
      reference: String(req.body?.reference || ""),
      approver: String(req.body?.approver || req.user.name),
      date: String(req.body?.date || ""),
      phone: req.user.mobile || ""
    };
    db.prepare(`INSERT INTO jobs (id, organisation_id, building_id, created_by, title, area, trade_id, instructions, urgency, quote_deadline, owner_approval, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user.organisation_id, building.id, req.user.id, title, area,
      String(req.body?.tradeId || "other"), String(req.body?.instructions || "").slice(0, 500),
      String(req.body?.urgency || "standard").toLowerCase(), String(req.body?.deadline || ""),
      req.body?.ownerApproval ? 1 : 0, JSON.stringify(payload), now
    );
    addEvent(db, id, req.user.name, "Request posted.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.posted", subjectType: "job", subjectId: id, detail: { buildingId: building.id } });
    res.status(201).json({ job: clientJob(db, jobById(db, id), req.user) });
  });

  app.patch("/api/jobs/:id", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager can edit a request.");
    const job = visibleJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    if (job.stage !== "open") return sendError(res, 400, "This request can no longer be edited.");
    const arrived = db.prepare("SELECT COUNT(*) AS n FROM quotes WHERE job_id = ? AND status != 'withdrawn'").get(job.id).n;
    if (arrived) return sendError(res, 400, "Quotes have been received, so this request can no longer be edited.");
    const title = req.body?.title == null ? job.title : String(req.body.title).trim();
    const area = req.body?.area == null ? job.area : String(req.body.area).trim();
    const instructions = req.body?.instructions == null ? job.instructions : String(req.body.instructions).slice(0, 500);
    const tradeId = req.body?.tradeId == null ? job.trade_id : String(req.body.tradeId);
    const urgency = req.body?.urgency == null ? job.urgency : String(req.body.urgency).toLowerCase();
    const deadline = req.body?.deadline == null ? job.quote_deadline : String(req.body.deadline);
    if (title.length < 2 || area.length < 2) return sendError(res, 400, "Add a title and the place in the building.");
    const payload = JSON.parse(job.payload || "{}");
    if (req.body?.date != null) payload.date = String(req.body.date);
    db.prepare(`UPDATE jobs SET title = ?, area = ?, trade_id = ?, instructions = ?, urgency = ?, quote_deadline = ?, payload = ? WHERE id = ?`).run(
      title, area, tradeId, instructions, urgency, deadline || "", JSON.stringify(payload), job.id
    );
    addEvent(db, job.id, req.user.name, "Request edited by the manager.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.edited", subjectType: "job", subjectId: job.id, detail: {} });
    res.json({ job: clientJob(db, jobById(db, job.id), req.user) });
  });

  app.post("/api/jobs/:id/extend-deadline", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager can extend the quote deadline.");
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.stage !== "open") return sendError(res, 400, "This job is not open for quotes.");
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const today = todayIn(regionOf(db, building).timeZone);
    const current = /^\d{4}-\d{2}-\d{2}$/.test(job.quote_deadline || "") ? job.quote_deadline : today;
    const base = current < today ? today : current;
    const next = addDays(base, 2);
    db.prepare("UPDATE jobs SET quote_deadline = ? WHERE id = ?").run(next, job.id);
    addEvent(db, job.id, req.user.name, "Quote deadline extended to " + next + ".");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.deadline_extended", subjectType: "job", subjectId: job.id, detail: { quoteDeadline: next } });
    res.json({ quoteDeadline: next });
  });

  app.post("/api/jobs/:id/quotes/:quoteId/decline", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager can decline a quote.");
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.stage !== "open") return sendError(res, 400, "This job is not open.");
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND job_id = ? AND status = 'open'").get(req.params.quoteId, job.id);
    if (!quote) return sendError(res, 404, "That quote is not open.");
    const reason = String(req.body?.reason || "").trim().slice(0, 120);
    const now = new Date().toISOString();
    db.prepare("UPDATE quotes SET status = 'declined', decline_reason = ?, declined_at = ? WHERE id = ?").run(reason, now, quote.id);
    addEvent(db, job.id, req.user.name, "Declined the quote" + (reason ? " (" + reason + ")." : "."));
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "quote.declined", subjectType: "quote", subjectId: quote.id, detail: { reason } });
    res.json({ status: "declined", reason });
  });

  app.post("/api/jobs/:id/quotes/:quoteId/undo-decline", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only a manager can restore a quote.");
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.stage !== "open") return sendError(res, 400, "This job is not open.");
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND job_id = ? AND status = 'declined'").get(req.params.quoteId, job.id);
    if (!quote) return sendError(res, 404, "That quote is not declined.");
    db.prepare("UPDATE quotes SET status = 'open', decline_reason = '', declined_at = '' WHERE id = ?").run(quote.id);
    addEvent(db, job.id, req.user.name, "Restored the declined quote.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "quote.decline_undone", subjectType: "quote", subjectId: quote.id, detail: {} });
    res.json({ status: "open" });
  });

  app.post("/api/jobs/:id/quotes/:quoteId/withdraw", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "contractor") return sendError(res, 403, "Only the contractor who sent the offer can withdraw it.");
    const job = jobById(db, req.params.id);
    if (!job || job.stage !== "open" || job.awarded_quote_id) return sendError(res, 400, "This offer can no longer be withdrawn.");
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND job_id = ? AND status = 'open'").get(req.params.quoteId, job.id);
    if (!quote || quote.contractor_user_id !== req.user.id) return sendError(res, 404, "That offer is not yours.");
    db.prepare("UPDATE quotes SET status = 'withdrawn' WHERE id = ?").run(quote.id);
    addEvent(db, job.id, req.user.name, "Withdrew their offer.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "quote.withdrawn", subjectType: "quote", subjectId: quote.id, detail: {} });
    res.json({ status: "withdrawn" });
  });

  app.post("/api/jobs/:id/cancel", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    if (job.stage !== "approved" && job.stage !== "paid") return sendError(res, 400, "This job can only be cancelled before the contractor arrives.");
    if (job.arrival_status === "arrived") return sendError(res, 400, "This job can no longer be cancelled here. The contractor has arrived.");
    if (!job.contractor_user_id) return sendError(res, 400, "This job has no booked contractor.");
    const held = db.prepare("SELECT 1 AS ok FROM payments WHERE job_id = ? AND status NOT IN ('failed', 'canceled', 'cancelled')").get(job.id);
    if (held) return sendError(res, 409, "A payment is already recorded. The platform owner can refund it. This job cannot be cancelled from here.");
    const contractor = req.user.role === "contractor";
    if (contractor && job.contractor_user_id !== req.user.id) return sendError(res, 403, "Only the booked contractor can cancel their own job.");
    if (!contractor && !MANAGER.has(req.user.role)) return sendError(res, 403, "You cannot cancel this job.");
    const reason = String(req.body?.reason || "").trim().slice(0, 160);
    if (reason.length < 3) return sendError(res, 400, "Add the reason for cancelling.");
    const excused = NO_STRIKE.has(reason);
    let strikeId = "";
    if (contractor && !excused) {
      strikeId = newId();
      db.prepare("INSERT INTO contractor_strikes (id, user_id, reason, actor_id, created_at, job_id, kind) VALUES (?, ?, ?, ?, ?, ?, 'cancel')").run(
        strikeId, req.user.id, reason, req.user.id, new Date().toISOString(), job.id
      );
    }
    db.prepare("UPDATE quotes SET status = 'withdrawn' WHERE id = ?").run(job.awarded_quote_id);
    db.prepare(`UPDATE jobs SET stage = 'open', approved_cents = NULL, awarded_quote_id = NULL, contractor_user_id = NULL, needs_prepay = 0, pay_after = 1, deposit_due_at = '', deposit_reminded_at = '' WHERE id = ?`).run(job.id);
    const note = contractor
      ? (excused ? "Cancelled before arrival. No strike: " + reason + "." : "Cancelled before arrival. A strike was recorded: " + reason + ".")
      : "The manager cancelled the job before arrival. No strike was recorded.";
    addEvent(db, job.id, req.user.name, note);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.cancelled_before_arrival", subjectType: "job", subjectId: job.id, detail: { reason, strike: !!strikeId } });
    const strikes = db.prepare("SELECT COUNT(*) AS n FROM contractor_strikes WHERE user_id = ? AND kind = 'cancel'").get(job.contractor_user_id || req.user.id).n;
    res.json({ stage: "open", strike: !!strikeId, strikeCount: strikes, excused });
  });

  app.post("/api/jobs/:id/quotes", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "contractor") return sendError(res, 403, "Only a contractor can make an offer.");
    const blocked = complianceBlock(db, req.user.id, new Date().toISOString().slice(0, 10));
    if (blocked) return sendError(res, 403, blocked);
    const job = jobById(db, req.params.id);
    if (!job || job.stage !== "open") return sendError(res, 404, "That job is not open for offers.");
    const trades = JSON.parse(req.user.trades || "[]");
    if (!trades.includes(job.trade_id) && job.trade_id !== "other") return sendError(res, 403, "This job is outside your licence.");
    const price = Math.round(Number(req.body?.price) * 100);
    if (!price || price <= 0) return sendError(res, 400, "Add a total price.");
    const scope = Array.isArray(req.body?.scope) ? req.body.scope.map(item => String(item).trim()).filter(Boolean) : [];
    if (!scope.length) return sendError(res, 400, "Add what is included.");
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const depositType = String(req.body?.depositType || "none");
    if (!depositAllowed(depositType, building.dep_cap)) return sendError(res, 400, "That deposit is above what this building accepts.");
    const region = regionOf(db, building);
    if (job.quote_deadline && job.quote_deadline < todayIn(region.timeZone)) return sendError(res, 400, "The quote deadline has passed.");
    const id = newId();
    db.prepare(`INSERT INTO quotes (id, job_id, contractor_user_id, price_cents, deposit_type, deposit_cents, start_date, start_time, duration, scope, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, job.id, req.user.id, price, depositType, depositCents(price, depositType),
      String(req.body?.date || ""), String(req.body?.time || "09:00"), String(req.body?.duration || "2h"),
      JSON.stringify(scope), String(req.body?.note || "").slice(0, 500), new Date().toISOString()
    );
    addEvent(db, job.id, req.user.name, "Offer sent for $" + (price / 100).toFixed(2) + ".");
    res.status(201).json({ quoteId: id });
  });

  app.post("/api/jobs/:id/approve", requireJson, requireUser, (req, res) => {
    if (!MANAGER.has(req.user.role)) return sendError(res, 403, "Only the building's manager can approve a quote.");
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.organisation_id !== req.user.organisation_id) return sendError(res, 404, "That job is not on your account.");
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND job_id = ? AND status = 'open'").get(String(req.body?.quoteId || ""), job.id);
    if (!quote) return sendError(res, 404, "That quote is not open.");
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const count = db.prepare("SELECT COUNT(*) AS n FROM quotes WHERE job_id = ? AND status = 'open'").get(job.id).n;
    const decision = approvalFor({
      world: building.world,
      role: req.user.role,
      urgency: job.urgency,
      priceCents: quote.price_cents,
      emLimitCents: 0,
      tiers: tiersOf(building),
      quoteCount: count,
      approvals: JSON.parse(job.approvals || "{}"),
      fewerReason: req.body?.fewerReason,
      ownerApproval: !!job.owner_approval,
      ownerDecision: req.body?.ownerDecision
    });
    if (!decision.ok) {
      const why = decision.notSet
        ? "Set all three budgets and the quotes needed for this building before you approve a quote."
        : (decision.missing[0] ? "Needs " + decision.missing[0] + "." : "More quotes are needed, or type the reason for using fewer.");
      return sendError(res, 400, why);
    }
    const prepay = quote.deposit_type !== "none";
    const settings = moneySettings(db, config);
    const urgentJob = job.urgency === "urgent" || job.urgency === "after_hours" || job.urgency === "emergency";
    const depositHours = urgentJob ? settings.urgentDepositHours : settings.depositHours;
    const depositDue = prepay ? new Date(Date.now() + depositHours * 3600 * 1000).toISOString() : "";
    db.prepare(`UPDATE jobs SET stage = ?, approved_cents = ?, awarded_quote_id = ?, contractor_user_id = ?, needs_prepay = ?, pay_after = ?, fewer_reason = ?, deposit_due_at = ?, deposit_reminded_at = '' WHERE id = ?`).run(
      prepay ? "approved" : "paid", quote.price_cents, quote.id, quote.contractor_user_id, prepay ? 1 : 0, prepay ? 0 : 1,
      String(req.body?.fewerReason || ""), depositDue, job.id
    );
    db.prepare("UPDATE quotes SET status = 'awarded' WHERE id = ?").run(quote.id);
    const workOrder = job.work_order || takeNumber(db, "work-order", "WO-");
    const quoteNumber = quote.quote_number || takeNumber(db, "quote", "Q-");
    db.prepare("UPDATE jobs SET work_order = ? WHERE id = ?").run(workOrder, job.id);
    db.prepare("UPDATE quotes SET quote_number = ? WHERE id = ?").run(quoteNumber, quote.id);
    addEvent(db, job.id, req.user.name, (prepay ? "Quote approved. Payment before the start is still unpaid. " : "Quote approved. Nothing is paid before the work. ") + "Work order " + workOrder + ".");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.approved", subjectType: "job", subjectId: job.id, detail: { prepay, quoteId: quote.id } });
    const urgent = job.urgency === "urgent" || job.urgency === "after_hours";
    res.json({
      stage: prepay ? "approved" : "paid",
      paid: false,
      urgent,
      urgentFeeCents: urgent ? settings.urgentFeeCents : 0,
      commissionPercent: settings.commissionPercent,
      shownBeforeApproval: true
    });
  });

  app.post("/api/jobs/:id/messages", requireJson, requireUser, async (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const text = String(req.body?.text || "").trim();
    if (!text || text.length > 500) return sendError(res, 400, "Write a message of up to 500 characters.");
    const booked = !!job.awarded_quote_id;
    if (!booked && hasContact(text)) return sendError(res, 400, "Phone numbers and emails cannot be shared before the job is booked.");
    const contractorId = req.user.role === "contractor" ? req.user.id : String(req.body?.contractorId || "");
    if (req.user.role === "contractor" && contractorId !== req.user.id) return sendError(res, 403, "You can only write in your own thread.");
    if (!contractorId) return sendError(res, 400, "Choose the contractor this message is for.");
    const onJob = db.prepare("SELECT 1 AS ok FROM quotes WHERE job_id = ? AND contractor_user_id = ?").get(job.id, contractorId) || job.contractor_user_id === contractorId;
    if (!onJob) return sendError(res, 400, "That contractor is not on this job.");
    const id = newId();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO job_messages (id, job_id, contractor_user_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, job.id, contractorId, req.user.id, text, now);
    addEvent(db, job.id, req.user.name, "Message sent.");
    const recipients = req.user.role === "contractor"
      ? db.prepare(`SELECT DISTINCT users.id, users.email FROM users
          JOIN building_assignments ON building_assignments.user_id = users.id
          WHERE building_assignments.building_id = ? AND users.id != ?`).all(job.building_id, req.user.id)
      : [db.prepare("SELECT id, email FROM users WHERE id = ?").get(contractorId)].filter(Boolean);
    for (const person of recipients) {
      if (!person || person.id === req.user.id) continue;
      await deliverNotice(db, mail, config, {
        userId: person.id,
        email: person.email,
        event: "msg",
        subject: "New message on " + job.title,
        text: req.user.name + " wrote on \"" + job.title + "\": " + text
      });
    }
    res.status(201).json({ id });
  });

  app.post("/api/jobs/:id/invoice", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    if (req.user.role !== "contractor" || job.contractor_user_id !== req.user.id) return sendError(res, 403, "Only the booked contractor can send the invoice.");
    const invoiceCents = Math.round(Number(req.body?.amount) * 100);
    const decision = invoiceDecision({ invoiceCents, approvedCents: job.approved_cents || 0, paidCents: 0 });
    addEvent(db, job.id, req.user.name, decision.hold ? "Invoice held. Nothing was requested from the payer." : "Invoice received. Payment is not marked paid until Stripe confirms it.");
    res.json({ ...decision, paid: false });
  });

  app.post("/api/jobs/:id/accept", requireJson, requireUser, async (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.organisation_id !== req.user.organisation_id) return sendError(res, 404, "That job is not on your account.");
    if (job.stage !== "review0" && job.stage !== "review1") return sendError(res, 400, "The work is not in review.");
    const waiting = db.prepare("SELECT * FROM payments WHERE job_id = ? AND status IN ('requires_payment', 'requires_capture')").all(job.id);
    for (const payment of waiting) await requestCapture(db, config, payment);
    db.prepare("UPDATE jobs SET stage = 'accepted' WHERE id = ?").run(job.id);
    addEvent(db, job.id, req.user.name, "The manager accepted the work. The final invoice follows. The money is not released by this button.");
    res.json({ stage: "accepted", paid: false });
  });

  app.post("/api/jobs/:id/challenge", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.organisation_id !== req.user.organisation_id) return sendError(res, 404, "That job is not on your account.");
    if (job.stage !== "review0" && job.stage !== "review1") return sendError(res, 400, "The work is not in review.");
    if (!Array.isArray(req.body?.items) || !req.body.items.length) return sendError(res, 400, "Choose at least one item to challenge.");
    const items = req.body.items.map(item => String(item).slice(0, 200)).slice(0, 20);
    const note = String(req.body?.note || "").slice(0, 500);
    const rounds = JSON.parse(job.challenges || "[]");
    rounds.push({ items, note, at: new Date().toISOString() });
    const next = job.stage === "review0" ? "fix1" : "fix2";
    db.prepare("UPDATE jobs SET stage = ?, challenges = ? WHERE id = ?").run(next, JSON.stringify(rounds), job.id);
    addEvent(db, job.id, req.user.name, "Manager challenged: " + items.join(", ") + ".");
    res.json({ stage: next, round: rounds.length });
  });

  app.post("/api/jobs/:id/submit-work", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.contractor_user_id !== req.user.id) return sendError(res, 403, "Only the booked contractor can hand in the work.");
    if (!["onsite", "fix1", "fix2"].includes(job.stage)) return sendError(res, 400, "The work is not ready to hand in.");
    const missing = evidenceGap(db, job);
    if (missing) return sendError(res, 400, missing);
    if (job.stage === "fix2") {
      db.prepare("UPDATE jobs SET stage = 'accepted' WHERE id = ?").run(job.id);
      addEvent(db, job.id, req.user.name, "The final fix was submitted. The work counts as accepted. The money is not released by this button.");
      return res.json({ stage: "accepted", paid: false });
    }
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const region = regionOf(db, building);
    const holidays = db.prepare("SELECT day FROM public_holidays WHERE region_id = ?").all(region.id).map(row => row.day);
    const end = reviewEndsAt(Date.now(), holidays, region.timeZone);
    const stage = job.stage === "fix1" ? "review1" : "review0";
    db.prepare("UPDATE jobs SET stage = ?, review_ends_at = ? WHERE id = ?").run(stage, end.at, job.id);
    addEvent(db, job.id, req.user.name, "Work submitted. The review stays open until " + end.at + (end.extended ? " because the 72 hours land on a weekend or public holiday." : "."));
    res.json({ stage, reviewEndsAt: end.at, extended: end.extended });
  });
}

function safetyAnswers(raw) {
  let list = [];
  try { list = JSON.parse(raw || "[]"); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  const answers = list.slice(0, 5);
  while (answers.length < 5) answers.push(null);
  return answers;
}

function evidenceBundle(db, jobId) {
  const bundle = { before: [], after: [], fix1: [], fix2: [] };
  const rows = db.prepare("SELECT * FROM job_evidence WHERE job_id = ? ORDER BY created_at").all(jobId);
  for (const row of rows) {
    if (!bundle[row.stage]) continue;
    bundle[row.stage].push({
      id: row.id,
      kind: row.kind,
      at: Date.parse(row.created_at) || Date.now(),
      distanceM: row.distance_m,
      seconds: row.kind === "video" ? 1 : 0
    });
  }
  return bundle;
}

function evidenceGap(db, job) {
  const count = (stage) => {
    const rows = db.prepare("SELECT kind FROM job_evidence WHERE job_id = ? AND stage = ?").all(job.id, stage);
    return { photos: rows.filter(row => row.kind === "photo").length, video: rows.some(row => row.kind === "video") };
  };
  if (job.stage === "onsite") {
    const before = count("before");
    const after = count("after");
    if (before.photos < 3 || after.photos < 3 || !after.video) return "Add the before photos, the after photos, and an after video.";
  } else {
    const fix = count(job.stage);
    if (fix.photos < 2 || !fix.video) return "Add the fix photos and a video.";
  }
  return "";
}

function jobById(db, id) {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
}

function visibleJob(db, user, id) {
  const job = jobById(db, id);
  if (!job) return null;
  if (MANAGER.has(user.role)) {
    const assigned = db.prepare("SELECT 1 AS ok FROM building_assignments WHERE user_id = ? AND building_id = ?").get(user.id, job.building_id);
    if (job.organisation_id === user.organisation_id && assigned) return job;
    return null;
  }
  if (user.role === "contractor") {
    if (job.contractor_user_id === user.id) return job;
    if (job.stage === "open") return job;
  }
  return null;
}

function tiersOf(building) {
  return [
    { limitCents: building.tier1_cents, quotes: building.tier1_quotes },
    { limitCents: building.tier2_cents, quotes: building.tier2_quotes },
    { limitCents: building.tier3_cents, quotes: building.tier3_quotes }
  ];
}

function addEvent(db, jobId, actor, body) {
  db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(jobId, new Date().toISOString(), actor, body);
}

function todayIn(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fundsStatus(db, job) {
  if (!job.needs_prepay || (job.stage !== "approved" && job.stage !== "paid")) return "";
  const confirmed = db.prepare("SELECT 1 AS ok FROM payments WHERE job_id = ? AND funds_confirmed_at != ''").get(job.id);
  return confirmed ? "Funds secured by Stripe – OK to start" : "Waiting for deposit – do not start work";
}

function regionOf(db, building) {
  const region = db.prepare("SELECT * FROM regions WHERE id = ?").get(building?.region_id || "AU-VIC");
  return { id: region?.id || "AU-VIC", timeZone: region?.time_zone || "Australia/Melbourne" };
}

function workspace(db, user, query = "") {
  let jobs;
  if (user.role === "contractor") {
    jobs = db.prepare("SELECT * FROM jobs WHERE stage = 'open' OR contractor_user_id = ?").all(user.id);
  } else if (MANAGER.has(user.role)) {
    jobs = db.prepare(`SELECT jobs.* FROM jobs
      JOIN building_assignments ON building_assignments.building_id = jobs.building_id
      WHERE jobs.organisation_id = ? AND building_assignments.user_id = ?`).all(user.organisation_id, user.id);
    const needle = String(query || "").trim().toLowerCase();
    if (needle) {
      jobs = jobs.filter(job => {
        const building = db.prepare("SELECT name, suburb FROM buildings WHERE id = ?").get(job.building_id);
        const hay = [job.title, job.area, job.instructions, job.trade_id, job.stage, building && building.name, building && building.suburb].join(" ").toLowerCase();
        return hay.includes(needle);
      });
    }
  } else jobs = [];
  const quotes = [];
  const contractors = new Map();
  const clientJobs = jobs.map(job => clientJob(db, job, user, quotes, contractors));
  return { jobs: clientJobs, quotes, contractors: [...contractors.values()] };
}

function clientJob(db, job, user, quotes = [], contractors = new Map()) {
  const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
  const booked = job.contractor_user_id && (user.role !== "contractor" || job.contractor_user_id === user.id);
  const showAddress = user.role !== "contractor" || (job.contractor_user_id === user.id && job.stage !== "open");
  const payload = JSON.parse(job.payload || "{}");
  const rows = db.prepare("SELECT * FROM quotes WHERE job_id = ? AND status != 'withdrawn'").all(job.id)
    .filter(quote => user.role !== "contractor" || quote.contractor_user_id === user.id);
  for (const quote of rows) {
    const person = db.prepare("SELECT * FROM users WHERE id = ?").get(quote.contractor_user_id);
    const home = centreOf(person.base_postcode || "");
    contractors.set(person.id, {
      id: person.id,
      name: person.name,
      trades: JSON.parse(person.trades || "[]"),
      years: 0,
      gst: !!person.gst_registered,
      abn: person.abn,
      licence: "Licence details are checked by staff",
      licenceUntil: "2099-01-01",
      insuranceUntil: "2099-01-01",
      description: person.business_name,
      postcode: person.base_postcode || "",
      lat: home ? home.lat : null,
      lng: home ? home.lng : null,
      consentPublic: true,
      sample: false
    });
    quotes.push({
      id: quote.id,
      jobId: job.id,
      contractorId: person.id,
      price: quote.price_cents / 100,
      date: quote.start_date,
      time: quote.start_time,
      duration: quote.duration,
      scope: JSON.parse(quote.scope || "[]"),
      note: quote.note,
      at: Date.parse(quote.created_at),
      committeeApproved: false,
      depositType: quote.deposit_type,
      status: quote.status || "open",
      declineReason: quote.decline_reason || "",
      number: quote.quote_number || ""
    });
  }
  return {
    id: job.id,
    owned: user.role !== "contractor",
    sample: false,
    buildingId: showAddress ? building.id : null,
    area: job.area,
    title: job.title,
    tradeId: job.trade_id,
    instructions: job.instructions,
    photos: [],
    video: null,
    safety: payload.safety || ["no", "no", "no", "no", "no", "no", "no"],
    urgency: job.urgency,
    date: payload.date || "",
    quoteDeadline: job.quote_deadline || "",
    workOrder: job.work_order || "",
    variations: db.prepare("SELECT * FROM job_variations WHERE job_id = ? ORDER BY created_at").all(job.id).map(row => ({
      id: row.id, number: row.number, amount: row.amount_cents / 100, reason: row.reason, status: row.status, declineReason: row.decline_reason
    })),
    invoice: (() => {
      const row = db.prepare("SELECT * FROM job_invoices WHERE job_id = ? ORDER BY created_at DESC LIMIT 1").get(job.id);
      return row ? { id: row.id, number: row.number, amount: row.amount_cents / 100, status: row.status, reason: row.return_reason, fileName: row.original_name } : null;
    })(),
    paymentRequests: db.prepare("SELECT * FROM payment_requests WHERE job_id = ? ORDER BY created_at").all(job.id).map(row => ({
      id: row.id, number: row.number, kind: row.kind, amount: row.amount_cents / 100, amountCents: row.amount_cents,
      dueOn: row.due_on, status: row.status, failureReason: row.failure_reason || ""
    })),
    messages: db.prepare(`SELECT job_messages.id, job_messages.body, job_messages.created_at, job_messages.contractor_user_id, users.name AS author
      FROM job_messages JOIN users ON users.id = job_messages.author_user_id
      WHERE job_messages.job_id = ? ORDER BY job_messages.created_at`).all(job.id)
      .filter(row => user.role !== "contractor" || row.contractor_user_id === user.id)
      .map(row => ({ id: row.id, contractorId: row.contractor_user_id, author: row.author, text: row.body, at: row.created_at })),
    closeState: job.closed_at ? "closed" : closeReady(db, job).ok ? "ready" : "",
    closedAt: job.closed_at || "",
    stage: job.stage,
    postedAt: Date.parse(job.created_at) || Date.now(),
    access: showAddress ? building.access_note : "",
    phone: showAddress ? (payload.phone || "") : "",
    awardedQuoteId: job.awarded_quote_id,
    awardedTo: showAddress ? job.contractor_user_id : null,
    payAfter: !!job.pay_after,
    needsPrepay: !!job.needs_prepay,
    fundsStatus: fundsStatus(db, job),
    approved: (job.approved_cents || 0) / 100,
    timeline: db.prepare("SELECT at, actor_name, body FROM job_events WHERE job_id = ? ORDER BY id").all(job.id).map(event => ({ t: event.at, who: event.actor_name, text: event.body, x: event.body })),
    evidence: evidenceBundle(db, job.id),
    challenges: JSON.parse(job.challenges || "[]"),
    arrival: job.arrival_status || null,
    eta: job.arrival_eta || null,
    arrivalAt: job.arrival_at ? Date.parse(job.arrival_at) : null,
    arrivalDistance: job.arrival_distance_m,
    arrivalConfirmed: job.arrival_confirmed === 1,
    safetyOnSite: safetyAnswers(job.safety_answers),
    stoppedUnsafe: job.stopped_unsafe === 1,
    place: {
      buildingName: showAddress ? building.name : building.suburb,
      streetNumber: showAddress ? building.street_number : "",
      street: building.street,
      suburb: building.suburb,
      lat: building.lat,
      lng: building.lng,
      oc: showAddress ? building.oc_plan : "",
      access: showAddress ? building.access_note : "",
      open: building.open_time,
      close: building.close_time,
      weekends: !!building.weekends,
      captureM: building.capture_m,
      limit: building.tier1_cents / 100
    }
  };
}
