import { audit } from "./db.js";
import { newId } from "./ids.js";
import { releasePrepaidOnArrival } from "./payments.js";
import { saveObject, readObject } from "./storage.js";

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);
const ARRIVAL = new Set(["on_way", "late", "arrived", "cannot_get_in"]);
const STAGES = new Set(["before", "after", "fix1", "fix2"]);

export function registerEvidenceRoutes(app, { db, config, sendError, requireUser, requireJson }) {
  app.post("/api/jobs/:id/arrival", requireJson, requireUser, (req, res) => {
    const job = bookedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not booked to you.");
    if (job.stage !== "paid" && job.stage !== "approved") return sendError(res, 400, "Arrival is recorded once the job is booked.");
    const status = String(req.body?.status || "");
    if (!ARRIVAL.has(status)) return sendError(res, 400, "Choose on the way, running late, arrived, or cannot get in.");
    const eta = Math.max(0, Math.min(240, Math.round(Number(req.body?.eta) || 0)));
    let distance = null;
    if (status === "arrived" || status === "cannot_get_in") {
      const check = distanceCheck(db, job, req.body);
      if (check.error) return sendError(res, 400, check.error);
      distance = check.metres;
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE jobs SET arrival_status = ?, arrival_eta = ?, arrival_at = ?, arrival_distance_m = ?, arrival_confirmed = 0 WHERE id = ?").run(
      status, eta, now, distance, job.id
    );
    const line = status === "on_way" ? "On the way, about " + eta + " minutes."
      : status === "late" ? "Running late, about " + eta + " minutes."
        : status === "arrived" ? "Arrived, " + distance + " m from the building."
          : "Contractor cannot get in.";
    addEvent(db, job.id, req.user.name, line);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.arrival", subjectType: "job", subjectId: job.id, detail: { status, distance } });
    res.json({ status, distanceM: distance, eta });
  });

  app.post("/api/jobs/:id/confirm-arrival", requireJson, requireUser, async (req, res) => {
    const job = managerJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    if (job.arrival_status !== "arrived") return sendError(res, 400, "The contractor has not recorded an arrival.");
    db.prepare("UPDATE jobs SET arrival_confirmed = 1 WHERE id = ?").run(job.id);
    addEvent(db, job.id, req.user.name, "Arrival confirmed.");
    await releasePrepaidOnArrival(db, config, db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id));
    res.json({ confirmed: true });
  });

  app.post("/api/jobs/:id/let-in", requireJson, requireUser, (req, res) => {
    const job = managerJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    if (job.arrival_status !== "cannot_get_in") return sendError(res, 400, "The contractor has not said they cannot get in.");
    db.prepare("UPDATE jobs SET arrival_status = 'arrived', arrival_at = ? WHERE id = ?").run(new Date().toISOString(), job.id);
    addEvent(db, job.id, req.user.name, "The manager let the contractor in.");
    res.json({ status: "arrived" });
  });

  app.post("/api/jobs/:id/safety", requireJson, requireUser, (req, res) => {
    const job = bookedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not booked to you.");
    const answers = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, 5) : [];
    const clean = answers.map(value => (value === "yes" || value === "no" ? value : null));
    while (clean.length < 5) clean.push(null);
    db.prepare("UPDATE jobs SET safety_answers = ? WHERE id = ?").run(JSON.stringify(clean), job.id);
    res.json({ answers: clean });
  });

  app.post("/api/jobs/:id/start", requireJson, requireUser, (req, res) => {
    const job = bookedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not booked to you.");
    if (job.arrival_status !== "arrived") return sendError(res, 400, "Arrive before you start work.");
    const answers = JSON.parse(job.safety_answers || "[]");
    if (!Array.isArray(answers) || answers.length < 5 || answers.some(value => value !== "yes")) {
      return sendError(res, 400, "Answer yes to every safety question before you start.");
    }
    db.prepare("UPDATE jobs SET stage = 'onsite' WHERE id = ?").run(job.id);
    addEvent(db, job.id, req.user.name, "Work started. On-site safety answers saved.");
    res.json({ stage: "onsite" });
  });

  app.post("/api/jobs/:id/unsafe", requireJson, requireUser, (req, res) => {
    const job = bookedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not booked to you.");
    db.prepare("UPDATE jobs SET stage = 'paid', safety_answers = '[]', stopped_unsafe = 1 WHERE id = ?").run(job.id);
    addEvent(db, job.id, req.user.name, "Stopped as unsafe and left. No penalty and no strike.");
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "job.stopped_unsafe", subjectType: "job", subjectId: job.id, detail: {} });
    res.json({ stage: "paid", strike: false });
  });

  app.post("/api/jobs/:id/evidence", requireJson, requireUser, async (req, res) => {
    const job = bookedJob(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not booked to you.");
    const stage = String(req.body?.stage || "");
    const kind = req.body?.kind === "video" ? "video" : "photo";
    if (!STAGES.has(stage)) return sendError(res, 400, "Choose which part of the job this evidence is for.");
    const existing = db.prepare("SELECT kind FROM job_evidence WHERE job_id = ? AND stage = ?").all(job.id, stage);
    if (kind === "photo" && existing.filter(row => row.kind === "photo").length >= 10) return sendError(res, 400, "You can add up to 10 photos for this stage.");
    if (kind === "video" && existing.some(row => row.kind === "video")) return sendError(res, 400, "You can add one video for this stage.");
    const check = distanceCheck(db, job, req.body);
    if (check.error) return sendError(res, 400, check.error);
    const id = newId();
    const stored = await writeEvidence(config, id, kind, req.body?.data);
    if (stored.error) return sendError(res, 400, stored.error);
    db.prepare("INSERT INTO job_evidence (id, job_id, stage, kind, distance_m, stored_name, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id, job.id, stage, kind, check.metres, stored.name, stored.type, new Date().toISOString()
    );
    addEvent(db, job.id, req.user.name, (kind === "photo" ? "Photo" : "Video") + " added (" + stage + "), " + check.metres + " m from the building.");
    res.status(201).json({ id, distanceM: check.metres, kind, stage });
  });

  app.get("/api/jobs/:id/evidence/:evidenceId", requireUser, async (req, res) => {
    const job = visible(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const row = db.prepare("SELECT * FROM job_evidence WHERE id = ? AND job_id = ?").get(req.params.evidenceId, job.id);
    if (!row) return sendError(res, 404, "That evidence is not on this job.");
    const bytes = await readObject(config, "photo", row.stored_name);
    if (!bytes) return sendError(res, 404, "That file is no longer stored.");
    res.setHeader("Content-Type", row.content_type || "application/octet-stream");
    res.send(bytes);
  });

  app.get("/api/jobs/:id/evidence.txt", requireUser, (req, res) => {
    const job = visible(db, req.user, req.params.id);
    if (!job) return sendError(res, 404, "That job is not on your account.");
    const building = db.prepare("SELECT * FROM buildings WHERE id = ?").get(job.building_id);
    const rows = db.prepare("SELECT * FROM job_evidence WHERE job_id = ? ORDER BY created_at").all(job.id);
    const lines = [
      "Evidence record",
      job.title,
      [building.street_number, building.street, building.suburb].filter(Boolean).join(" "),
      "Arrival: " + (job.arrival_status || "not recorded") + (job.arrival_distance_m == null ? "" : " (" + job.arrival_distance_m + " m)"),
      "Safety: " + (job.safety_answers || "[]"),
      "Stopped as unsafe: " + (job.stopped_unsafe ? "yes" : "no")
    ];
    for (const row of rows) lines.push(row.created_at + " " + row.stage + " " + row.kind + " " + row.distance_m + " m");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(lines.join("\n"));
  });
}

function bookedJob(db, user, id) {
  if (user.role !== "contractor") return null;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!job || job.contractor_user_id !== user.id) return null;
  return job;
}

function managerJob(db, user, id) {
  if (!MANAGER.has(user.role)) return null;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!job || job.organisation_id !== user.organisation_id) return null;
  const assigned = db.prepare("SELECT 1 AS ok FROM building_assignments WHERE user_id = ? AND building_id = ?").get(user.id, job.building_id);
  return assigned ? job : null;
}

function visible(db, user, id) {
  return bookedJob(db, user, id) || managerJob(db, user, id);
}

function distanceCheck(db, job, body) {
  if (body?.far === true) return { error: "You are 640 m from the building. Move closer and retake it." };
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "Share your location so the distance can be checked." };
  const building = db.prepare("SELECT lat, lng, capture_m FROM buildings WHERE id = ?").get(job.building_id);
  if (building?.lat == null || building?.lng == null) return { error: "This building has no map location yet, so the distance cannot be checked." };
  const limit = Number(building.capture_m) || 150;
  const metres = Math.round(metresBetween(Number(building.lat), Number(building.lng), lat, lng));
  if (metres > limit) return { error: "You are " + metres + " m from the building. The limit here is " + limit + " m. Move closer and retake it." };
  return { metres };
}

function metresBetween(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function writeEvidence(config, id, kind, data) {
  let bytes = Buffer.from("TaskSpeck Strata evidence " + kind + " " + id);
  let type = "text/plain";
  let name = id + ".txt";
  if (typeof data === "string" && data.startsWith("data:")) {
    const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!match) return { error: "That file could not be read." };
    bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 8 * 1024 * 1024) return { error: "That file is too large." };
    type = match[1];
    name = id + (kind === "video" ? ".mp4" : ".img");
  }
  await saveObject(config, "photo", name, bytes, type);
  return { name, type };
}

function addEvent(db, jobId, actor, body) {
  db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(jobId, new Date().toISOString(), actor, body);
}
