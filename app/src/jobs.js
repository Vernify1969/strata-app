import { audit } from "./db.js";
import { complianceBlock } from "./documents.js";
import { abnOk, newId } from "./ids.js";
import { moneySettings } from "./payments.js";
import { approvalFor, depositAllowed, depositCents, hasContact, invoiceDecision, reviewEndsAt } from "./rules.js";

// TODO(owner): refunds are not built. A cancellation before arrival should refund through Stripe once you decide the policy.
// TODO(owner): disputes are not built. TaskSpeck never decides who is right.
// TODO(owner): the Strata administrator role is not defined, so it is not a role in this app.
// TODO(owner): unpaid deposit expiry is not built. A deposit is not cancelled automatically.

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);

export function registerJobRoutes(app, { db, config = {}, sendError, requireUser, requireJson }) {
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
    res.json(workspace(db, req.user));
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
    if (job.quote_deadline && job.quote_deadline < melbourneToday()) return sendError(res, 400, "The quote deadline has passed.");
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
    const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND job_id = ? AND status = 'open'").get(req.body?.quoteId, job.id);
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
      const why = decision.notSet ? "Set the budgets before you approve." : (decision.missing[0] ? "Needs " + decision.missing[0] + "." : "More quotes are needed, or type the reason for using fewer.");
      return sendError(res, 400, why);
    }
    const prepay = quote.deposit_type !== "none";
    db.prepare(`UPDATE jobs SET stage = ?, approved_cents = ?, awarded_quote_id = ?, contractor_user_id = ?, needs_prepay = ?, pay_after = ?, fewer_reason = ? WHERE id = ?`).run(
      prepay ? "approved" : "paid", quote.price_cents, quote.id, quote.contractor_user_id, prepay ? 1 : 0, prepay ? 0 : 1,
      String(req.body?.fewerReason || ""), job.id
    );
    db.prepare("UPDATE quotes SET status = 'awarded' WHERE id = ?").run(quote.id);
    addEvent(db, job.id, req.user.name, prepay ? "Quote approved. Payment before the start is still unpaid." : "Quote approved. Nothing is paid before the work.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.approved", subjectType: "job", subjectId: job.id, detail: { prepay, quoteId: quote.id } });
    const settings = moneySettings(db, config);
    const urgent = job.urgency === "urgent" || job.urgency === "after_hours";
    res.json({
      stage: prepay ? "approved" : "paid",
      paid: false,
      urgent,
      urgentFeeCents: urgent ? settings.urgentFeeCents : 0,
      commissionPercent: settings.commissionPercent,
      shownBeforeApproval: true,
      // TODO(owner): refunds and disputes are not decided. Do not refund or judge from this approval.
    });
  });

  app.post("/api/jobs/:id/messages", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const text = String(req.body?.text || "").trim();
    if (!text || text.length > 500) return sendError(res, 400, "Write a message of up to 500 characters.");
    const booked = !!job.awarded_quote_id;
    if (!booked && hasContact(text)) return sendError(res, 400, "Phone numbers and emails cannot be shared before the job is booked.");
    const contractorId = req.user.role === "contractor" ? req.user.id : String(req.body?.contractorId || "");
    if (req.user.role === "contractor" && contractorId !== req.user.id) return sendError(res, 403, "You can only write in your own thread.");
    if (!contractorId) return sendError(res, 400, "Choose the contractor this message is for.");
    const id = newId();
    db.prepare(`INSERT INTO job_messages (id, job_id, contractor_user_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, job.id, contractorId, req.user.id, text, new Date().toISOString());
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

  app.post("/api/jobs/:id/accept", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.organisation_id !== req.user.organisation_id) return sendError(res, 404, "That job is not on your account.");
    if (job.stage !== "review0" && job.stage !== "review1") return sendError(res, 400, "The work is not in review.");
    db.prepare("UPDATE jobs SET stage = 'accepted' WHERE id = ?").run(job.id);
    addEvent(db, job.id, req.user.name, "The manager accepted the work. The final invoice follows. The money is not released by this button.");
    res.json({ stage: "accepted", paid: false });
  });

  app.post("/api/jobs/:id/challenge", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.organisation_id !== req.user.organisation_id) return sendError(res, 404, "That job is not on your account.");
    const photos = Number(req.body?.photoCount || 0);
    if (photos < 1) return sendError(res, 400, "Add at least 1 photo showing what is wrong.");
    if (!Array.isArray(req.body?.items) || !req.body.items.length) return sendError(res, 400, "Choose at least one item to challenge.");
    const next = job.stage === "review0" ? "fix1" : "fix2";
    db.prepare("UPDATE jobs SET stage = ? WHERE id = ?").run(next, job.id);
    addEvent(db, job.id, req.user.name, "Manager challenged the work with " + photos + " photo" + (photos === 1 ? "" : "s") + ".");
    res.json({ stage: next });
  });

  app.post("/api/jobs/:id/submit-work", requireJson, requireUser, (req, res) => {
    const job = visibleJob(db, req.user, req.params.id);
    if (!job || job.contractor_user_id !== req.user.id) return sendError(res, 403, "Only the booked contractor can hand in the work.");
    const holidays = db.prepare("SELECT day FROM public_holidays WHERE region_id = 'AU-VIC'").all().map(row => row.day);
    const end = reviewEndsAt(Date.now(), holidays);
    const stage = job.stage === "fix1" ? "review1" : "review0";
    db.prepare("UPDATE jobs SET stage = ?, review_ends_at = ? WHERE id = ?").run(stage, end.at, job.id);
    addEvent(db, job.id, req.user.name, "Work submitted. The review stays open until " + end.at + (end.extended ? " because the 72 hours land on a weekend or public holiday." : "."));
    res.json({ stage, reviewEndsAt: end.at, extended: end.extended });
  });
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

function melbourneToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function workspace(db, user) {
  let jobs;
  if (user.role === "contractor") {
    jobs = db.prepare("SELECT * FROM jobs WHERE stage = 'open' OR contractor_user_id = ?").all(user.id);
  } else if (MANAGER.has(user.role)) {
    jobs = db.prepare(`SELECT jobs.* FROM jobs
      JOIN building_assignments ON building_assignments.building_id = jobs.building_id
      WHERE jobs.organisation_id = ? AND building_assignments.user_id = ?`).all(user.organisation_id, user.id);
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
  const rows = db.prepare("SELECT * FROM quotes WHERE job_id = ?").all(job.id)
    .filter(quote => user.role !== "contractor" || quote.contractor_user_id === user.id);
  for (const quote of rows) {
    const person = db.prepare("SELECT * FROM users WHERE id = ?").get(quote.contractor_user_id);
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
      depositType: quote.deposit_type
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
    stage: job.stage,
    postedAt: Date.parse(job.created_at) || Date.now(),
    access: showAddress ? building.access_note : "",
    phone: showAddress ? (payload.phone || "") : "",
    awardedQuoteId: job.awarded_quote_id,
    awardedTo: showAddress ? job.contractor_user_id : null,
    payAfter: !!job.pay_after,
    needsPrepay: !!job.needs_prepay,
    approved: (job.approved_cents || 0) / 100,
    timeline: db.prepare("SELECT at, actor_name, body FROM job_events WHERE job_id = ? ORDER BY id").all(job.id).map(event => ({ t: event.at, who: event.actor_name, x: event.body })),
    evidence: { before: [], after: [], fix1: [], fix2: [] },
    challenges: [],
    arrival: null,
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
