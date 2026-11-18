import { centreOf } from "./area.js";

export function cachedPlace(db, key) {
  return db.prepare("SELECT lat, lng FROM geo_cache WHERE key = ?").get(key) || null;
}

export function rememberPlace(db, key, lat, lng) {
  db.prepare(`INSERT INTO geo_cache (key, lat, lng, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET lat = excluded.lat, lng = excluded.lng`).run(key, lat, lng, new Date().toISOString());
}

export function locatePostcode(db, postcode) {
  const code = String(postcode || "");
  if (!/^\d{4}$/.test(code)) return null;
  const key = "postcode:" + code;
  const hit = cachedPlace(db, key);
  if (hit) return { lat: hit.lat, lng: hit.lng, cached: true };
  const known = centreOf(code);
  if (!known) return null;
  rememberPlace(db, key, known.lat, known.lng);
  return { lat: known.lat, lng: known.lng, cached: false };
}

export async function locateAddress(db, config, address) {
  const text = String(address || "").trim();
  if (text.length < 4) return null;
  const key = "address:" + text.toLowerCase();
  const hit = cachedPlace(db, key);
  if (hit) return { lat: hit.lat, lng: hit.lng, cached: true };
  if (typeof config.geocode !== "function") return null;
  const found = await config.geocode(text);
  if (!found || found.lat == null || found.lng == null) return null;
  rememberPlace(db, key, Number(found.lat), Number(found.lng));
  return { lat: Number(found.lat), lng: Number(found.lng), cached: false };
}
