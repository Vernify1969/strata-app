import { audit } from "./db.js";
import { centreOf } from "./area.js";
import { newId } from "./ids.js";

const MANAGER_WORLDS = { common: "common", private: "private" };

export function registerBuildingRoutes(app, { db, sendError, requireUser, requireJson }) {
  app.get("/api/area", requireUser, (_req, res) => {
    const postcodes = db.prepare("SELECT postcode FROM service_postcodes ORDER BY postcode").all().map(row => row.postcode);
    res.json({
      postcodes,
      note: "Coverage is this list of postcodes. The kilometre figure is only a rough distance from a postcode centre."
    });
  });

  app.put("/api/owner/postcodes", requireJson, requireUser, (req, res) => {
    if (req.user.role !== "platform_owner") return sendError(res, 403, "Only the platform owner can change the postcodes we serve.");
    const codes = Array.isArray(req.body?.postcodes) ? req.body.postcodes.map(code => String(code)) : null;
    if (!codes || codes.some(code => !/^\d{4}$/.test(code))) return sendError(res, 400, "Postcodes are four digits.");
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM service_postcodes").run();
      const insert = db.prepare("INSERT INTO service_postcodes (postcode) VALUES (?)");
      for (const code of codes) insert.run(code);
      audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "area.postcodes_updated", subjectType: "area", subjectId: "postcodes", detail: { count: codes.length } });
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    res.json({ postcodes: codes });
  });

  app.get("/api/buildings", requireUser, (req, res) => {
    if (!MANAGER_WORLDS[req.user.world]) return sendError(res, 403, "This account does not keep buildings or properties.");
    const rows = db.prepare(`SELECT buildings.* FROM buildings
      JOIN building_assignments ON building_assignments.building_id = buildings.id
      WHERE buildings.organisation_id = ? AND building_assignments.user_id = ?
      ORDER BY buildings.created_at`).all(req.user.organisation_id, req.user.id);
    const waiting = db.prepare("SELECT * FROM waiting_places WHERE organisation_id = ? AND user_id = ? ORDER BY created_at").all(req.user.organisation_id, req.user.id);
    res.json({
      buildings: rows.filter(row => !row.archived).map(publicBuilding),
      archived: rows.filter(row => row.archived).map(publicBuilding),
      waiting: waiting.map(place => {
        const centre = centreOf(place.postcode);
        return {
          id: place.id,
          name: place.name,
          suburb: place.suburb,
          postcode: place.postcode,
          lat: centre ? centre.lat : null,
          lng: centre ? centre.lng : null
        };
      })
    });
  });

  app.get("/api/buildings/:id", requireUser, (req, res) => {
    const row = assignedBuilding(db, req.user, req.params.id);
    if (!row) return sendError(res, 404, "That building is not on your account.");
    res.json({ building: publicBuilding(row) });
  });

  app.post("/api/buildings", requireJson, requireUser, (req, res) => {
    const world = MANAGER_WORLDS[req.user.world];
    if (!world) return sendError(res, 403, "This account does not keep buildings or properties.");
    const parsed = readPlace(req.body || {}, world);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const served = db.prepare("SELECT postcode FROM service_postcodes WHERE postcode = ?").get(parsed.postcode);
    if (!served) {
      const id = newId();
      db.prepare(`INSERT INTO waiting_places (id, organisation_id, user_id, name, street_number, street, suburb, postcode, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.user.organisation_id, req.user.id, parsed.name, parsed.streetNumber, parsed.street, parsed.suburb, parsed.postcode, new Date().toISOString());
      audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "building.waiting", subjectType: "waiting_place", subjectId: id, detail: { postcode: parsed.postcode } });
      return res.status(202).json({
        waiting: true,
        message: `We do not cover ${parsed.postcode} yet. The details are on your waiting list. Nothing was added as a ${world === "private" ? "property" : "building"}.`
      });
    }
    const id = newId();
    const now = new Date().toISOString();
    const centre = centreOf(parsed.postcode);
    db.exec("BEGIN");
    try {
      db.prepare(`INSERT INTO buildings (
        id, organisation_id, world, name, street_number, street, suburb, postcode, lat, lng, oc_plan, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, req.user.organisation_id, world, parsed.name, parsed.streetNumber, parsed.street, parsed.suburb, parsed.postcode,
        centre ? centre.lat : null, centre ? centre.lng : null, parsed.ocPlan, now
      );
      db.prepare("INSERT INTO building_assignments (user_id, building_id) VALUES (?, ?)").run(req.user.id, id);
      audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "building.created", subjectType: "building", subjectId: id, detail: { world } });
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    res.status(201).json({ building: publicBuilding(assignedBuilding(db, req.user, id)) });
  });

  app.patch("/api/buildings/:id", requireJson, requireUser, (req, res) => {
    const row = assignedBuilding(db, req.user, req.params.id);
    if (!row) return sendError(res, 404, "That building is not on your account.");
    const body = req.body || {};
    if (body.organisationId || body.world) return sendError(res, 400, "A building stays with the organisation that created it.");
    const next = { ...row };
    if (body.name != null) next.name = String(body.name).trim();
    if (body.streetNumber != null) next.street_number = String(body.streetNumber).trim();
    if (body.street != null) next.street = String(body.street).trim();
    if (body.suburb != null) next.suburb = String(body.suburb).trim();
    if (body.ocPlan != null) next.oc_plan = String(body.ocPlan).trim();
    if (body.access != null) next.access_note = String(body.access).slice(0, 2000);
    if (body.open != null) next.open_time = String(body.open);
    if (body.close != null) next.close_time = String(body.close);
    if (body.weekends != null) next.weekends = body.weekends ? 1 : 0;
    if (body.captureM != null) next.capture_m = Math.max(10, Math.min(500, Number(body.captureM) || 150));
    if (next.name.length < 2 || next.street.length < 2) return sendError(res, 400, "Add a name and a street.");
    if (body.postcode != null) {
      const postcode = String(body.postcode);
      if (!/^\d{4}$/.test(postcode)) return sendError(res, 400, "Use a 4 digit postcode.");
      if (!db.prepare("SELECT postcode FROM service_postcodes WHERE postcode = ?").get(postcode)) {
        return sendError(res, 400, "We do not cover this area yet.");
      }
      next.postcode = postcode;
      const centre = centreOf(postcode);
      next.lat = centre ? centre.lat : null;
      next.lng = centre ? centre.lng : null;
    }
    if (row.world === "private") {
      if (body.quotesWanted != null) {
        const wanted = Number(body.quotesWanted);
        if (![1, 2, 3].includes(wanted)) return sendError(res, 400, "Quotes wanted is 1, 2 or 3. It is your choice, not a rule.");
        next.quotes_wanted = wanted;
      }
    } else if (body.tier1 != null || body.tier2 != null || body.tier3 != null || body.q1 != null || body.q2 != null || body.q3 != null || body.keepTiers) {
      const tiers = readTiers(body, row);
      if (tiers.error) return sendError(res, 400, tiers.error);
      next.tier1_cents = tiers.limits[0];
      next.tier2_cents = tiers.limits[1];
      next.tier3_cents = tiers.limits[2];
      next.tier1_quotes = tiers.quotes[0];
      next.tier2_quotes = tiers.quotes[1];
      next.tier3_quotes = tiers.quotes[2];
      next.tiers_confirmed = 1;
    }
    db.prepare(`UPDATE buildings SET name=?, street_number=?, street=?, suburb=?, postcode=?, lat=?, lng=?, oc_plan=?, quotes_wanted=?,
      tier1_cents=?, tier1_quotes=?, tier2_cents=?, tier2_quotes=?, tier3_cents=?, tier3_quotes=?, tiers_confirmed=?,
      open_time=?, close_time=?, weekends=?, access_note=?, capture_m=? WHERE id=? AND organisation_id=?`).run(
      next.name, next.street_number, next.street, next.suburb, next.postcode, next.lat, next.lng, next.oc_plan, next.quotes_wanted,
      next.tier1_cents, next.tier1_quotes, next.tier2_cents, next.tier2_quotes, next.tier3_cents, next.tier3_quotes, next.tiers_confirmed,
      next.open_time, next.close_time, next.weekends, next.access_note, next.capture_m, row.id, req.user.organisation_id
    );
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "building.updated", subjectType: "building", subjectId: row.id, detail: {} });
    res.json({ building: publicBuilding(assignedBuilding(db, req.user, row.id)) });
  });

  app.post("/api/buildings/:id/archive", requireJson, requireUser, (req, res) => {
    const row = assignedBuilding(db, req.user, req.params.id);
    if (!row) return sendError(res, 404, "That building is not on your account.");
    const active = db.prepare(`SELECT COUNT(*) AS n FROM buildings
      JOIN building_assignments ON building_assignments.building_id = buildings.id
      WHERE buildings.organisation_id = ? AND building_assignments.user_id = ? AND buildings.archived = 0`).get(req.user.organisation_id, req.user.id);
    if (Number(active.n) <= 1) return sendError(res, 400, "The last building or property cannot be archived.");
    db.prepare("UPDATE buildings SET archived = 1 WHERE id = ? AND organisation_id = ?").run(row.id, req.user.organisation_id);
    audit(db, { actorId: req.user.id, organisationId: req.user.organisation_id, action: "building.archived", subjectType: "building", subjectId: row.id, detail: {} });
    res.json({ ok: true });
  });
}

function assignedBuilding(db, user, id) {
  if (!MANAGER_WORLDS[user.world]) return null;
  return db.prepare(`SELECT buildings.* FROM buildings
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE buildings.id = ? AND buildings.organisation_id = ? AND building_assignments.user_id = ?`).get(id, user.organisation_id, user.id);
}

function readPlace(body, world) {
  const name = String(body.name || "").trim();
  const streetNumber = String(body.streetNumber || "").trim();
  const street = String(body.street || "").trim();
  const suburb = String(body.suburb || "").trim();
  const postcode = String(body.postcode || "").trim();
  const ocPlan = String(body.ocPlan || "").trim();
  if (name.length < 2 || street.length < 2 || suburb.length < 2) return { error: "Add the name, street and suburb." };
  if (!streetNumber) return { error: "Add the street number." };
  if (!/^\d{4}$/.test(postcode)) return { error: "Use a 4 digit postcode." };
  if (world === "common" && ocPlan.length < 2) return { error: "Add the OC or plan number." };
  return { name, streetNumber, street, suburb, postcode, ocPlan };
}

function dollarsToCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100);
}

function readTiers(body, row) {
  const limits = [
    body.tier1 != null ? dollarsToCents(body.tier1) : row.tier1_cents,
    body.tier2 != null ? dollarsToCents(body.tier2) : row.tier2_cents,
    body.tier3 != null ? dollarsToCents(body.tier3) : row.tier3_cents
  ];
  const quotes = [
    body.q1 != null ? Number(body.q1) : row.tier1_quotes,
    body.q2 != null ? Number(body.q2) : row.tier2_quotes,
    body.q3 != null ? Number(body.q3) : row.tier3_quotes
  ];
  if (limits.some(item => item == null)) return { error: "Each budget needs an amount." };
  if (!(limits[0] < limits[1] && limits[1] < limits[2])) return { error: "Each budget must be higher than the one before." };
  if (quotes.some(item => !Number.isInteger(item) || item < 1 || item > 5)) return { error: "Quotes needed must be from 1 to 5." };
  if (quotes[1] < quotes[0] || quotes[2] < quotes[1]) return { error: "A higher budget cannot need fewer quotes than a lower one." };
  return { limits, quotes };
}

function dollars(cents) {
  return cents / 100;
}

export function publicBuilding(row) {
  return {
    id: row.id,
    world: row.world,
    name: row.name,
    streetNumber: row.street_number,
    street: row.street,
    suburb: row.suburb,
    postcode: row.postcode,
    lat: row.lat,
    lng: row.lng,
    oc: row.oc_plan,
    ocAbn: "",
    quotesWanted: row.quotes_wanted,
    tier1: dollars(row.tier1_cents),
    q1: row.tier1_quotes,
    tier2: dollars(row.tier2_cents),
    q2: row.tier2_quotes,
    tier3: dollars(row.tier3_cents),
    q3: row.tier3_quotes,
    tiersConfirmed: !!row.tiers_confirmed,
    limit: dollars(row.tier1_cents),
    open: row.open_time,
    close: row.close_time,
    weekends: !!row.weekends,
    access: row.access_note,
    captureM: row.capture_m,
    archived: !!row.archived,
    regionId: row.region_id,
    sample: false
  };
}
