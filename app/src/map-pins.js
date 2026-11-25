import { centreOf } from "./area.js";

const MANAGER = new Set(["building_manager", "oc_manager", "property_manager"]);
const COVER_KM = 12;

export function registerMapPinRoutes(app, { db, requireUser }) {
  app.get("/api/map-pins", requireUser, (req, res) => {
    res.json(mapPins(db, req.user));
  });
}

export function mapPins(db, user) {
  if (user.role === "platform_owner") return { points: spread(ownerPoints(db)), booked: [], coverage: null };
  if (user.role === "contractor") return contractorPins(db, user);
  if (MANAGER.has(user.role)) return { points: spread(managerPoints(db, user)), booked: [], coverage: null };
  return { points: [], booked: [], coverage: null };
}

function managerPoints(db, user) {
  const buildings = db.prepare(`SELECT buildings.* FROM buildings
    JOIN building_assignments ON building_assignments.building_id = buildings.id
    WHERE buildings.organisation_id = ? AND building_assignments.user_id = ? AND buildings.archived = 0`).all(user.organisation_id, user.id);
  const jobs = db.prepare(`SELECT jobs.*, buildings.name AS building_name, buildings.street_number, buildings.street, buildings.suburb, buildings.postcode, buildings.lat, buildings.lng
    FROM jobs JOIN buildings ON buildings.id = jobs.building_id
    JOIN building_assignments ON building_assignments.building_id = jobs.building_id
    WHERE jobs.organisation_id = ? AND building_assignments.user_id = ?`).all(user.organisation_id, user.id);
  return buildings.map(buildingPin).filter(Boolean).concat(jobs.map(row => jobPin(row, false)).filter(Boolean));
}

function ownerPoints(db) {
  const buildings = db.prepare("SELECT * FROM buildings WHERE archived = 0").all();
  const jobs = db.prepare(`SELECT jobs.*, buildings.name AS building_name, buildings.street_number, buildings.street, buildings.suburb, buildings.postcode, buildings.lat, buildings.lng
    FROM jobs JOIN buildings ON buildings.id = jobs.building_id`).all();
  return buildings.map(buildingPin).filter(Boolean).concat(jobs.map(row => jobPin(row, false)).filter(Boolean));
}

function contractorPins(db, user) {
  const trades = parseTrades(user.trades);
  const home = centreOf(user.base_postcode || "");
  const coverage = home ? { lat: home.lat, lng: home.lng, km: COVER_KM } : null;
  const rows = db.prepare(`SELECT jobs.*, buildings.name AS building_name, buildings.street_number, buildings.street, buildings.suburb, buildings.postcode, buildings.lat AS blat, buildings.lng AS blng, buildings.id AS bid
    FROM jobs JOIN buildings ON buildings.id = jobs.building_id
    WHERE jobs.stage = 'open' OR jobs.contractor_user_id = ?`).all(user.id);
  const open = [];
  const booked = [];
  const seenOpen = new Set();
  const seenBooked = new Set();
  for (const row of rows) {
    const place = coords(row.blat, row.blng, row.postcode);
    if (!place) continue;
    const mine = row.contractor_user_id === user.id && row.stage !== "open";
    if (mine) {
      booked.push(jobPin(row, false));
      if (!seenBooked.has(row.bid)) {
        seenBooked.add(row.bid);
        booked.push(buildingPin({ id: row.bid, name: row.building_name, street_number: row.street_number, street: row.street, suburb: row.suburb, postcode: row.postcode, lat: row.blat, lng: row.blng }));
      }
      continue;
    }
    if (row.stage !== "open") continue;
    if (trades.length && !trades.includes(row.trade_id) && row.trade_id !== "other") continue;
    if (!home || kmBetween(home.lat, home.lng, place.lat, place.lng) > COVER_KM) continue;
    open.push(jobPin(row, true));
    if (!seenOpen.has(row.bid)) {
      seenOpen.add(row.bid);
      open.push({
        kind: "building",
        id: row.bid,
        lat: place.lat,
        lng: place.lng,
        title: row.suburb || "Building",
        detail: row.suburb || ""
      });
    }
  }
  return { points: spread(open.filter(Boolean)), booked: spread(booked.filter(Boolean)), coverage };
}

function buildingPin(row) {
  const place = coords(row.lat, row.lng, row.postcode);
  if (!place) return null;
  const street = [row.street_number, row.street].filter(Boolean).join(" ");
  return {
    kind: "building",
    id: row.id,
    lat: place.lat,
    lng: place.lng,
    title: row.name || row.suburb || "Building",
    detail: [street, row.suburb].filter(Boolean).join(", ")
  };
}

function jobPin(row, approx) {
  const place = coords(row.lat != null ? row.lat : row.blat, row.lng != null ? row.lng : row.blng, row.postcode);
  if (!place) return null;
  const street = [row.street_number, row.street].filter(Boolean).join(" ");
  return {
    kind: "job",
    id: row.id,
    lat: place.lat,
    lng: place.lng,
    title: row.title,
    detail: approx ? (row.suburb || "") : [street, row.suburb].filter(Boolean).join(", ")
  };
}

function coords(lat, lng, postcode) {
  if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
  const centre = centreOf(postcode || "");
  return centre ? { lat: centre.lat, lng: centre.lng } : null;
}

function spread(points) {
  const seen = new Map();
  return points.map(point => {
    const key = Number(point.lat).toFixed(4) + "," + Number(point.lng).toFixed(4);
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    if (!n) return point;
    const angle = n * 0.9;
    const metres = 90 + n * 45;
    const lat = point.lat + (metres / 111320) * Math.cos(angle);
    const lng = point.lng + (metres / (111320 * Math.cos(point.lat * Math.PI / 180))) * Math.sin(angle);
    return Object.assign({}, point, { lat, lng });
  });
}

function parseTrades(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function kmBetween(aLat, aLng, bLat, bLng) {
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLng = (bLng - aLng) * p;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h)));
}
