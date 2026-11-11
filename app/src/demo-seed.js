import { centreOf } from "./area.js";
import { newId } from "./ids.js";
import { hashPassword } from "./passwords.js";

// These are sample sign-ins for the public demo. They are not secrets.
export const DEMO_MANAGER = {
  email: "mina.costa@harbour.example",
  password: "Harbour1",
  name: "Mina Costa"
};

export const DEMO_CONTRACTOR = {
  email: "sam@plumbing.example",
  password: "Pipes123",
  name: "Sam Okonkwo"
};

export const DEMO_QR_TOKEN = "demo-lift-1";

function nextWeekday() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

export async function seedDemo(db) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  if (Number(existing.n) > 0) return { seeded: false };

  const now = new Date().toISOString();
  const managerOrg = newId();
  const contractorOrg = newId();
  const managerId = newId();
  const contractorId = newId();
  const buildingId = newId();
  const openJobId = newId();
  const quotedJobId = newId();
  const quoteId = newId();
  const placeId = newId();
  const centre = centreOf("3000");
  const visit = nextWeekday();
  const managerHash = await hashPassword(DEMO_MANAGER.password);
  const contractorHash = await hashPassword(DEMO_CONTRACTOR.password);

  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Harbour View OC', 'common', ?)").run(managerOrg, now);
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Sam Plumbing', 'contractor', ?)").run(contractorOrg, now);
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
      VALUES (?, ?, ?, ?, 'building_manager', ?, '0418000111', 'Harbour View OC', '51824753556', 'card', 1, ?, ?)`).run(
      managerId, managerOrg, DEMO_MANAGER.email, managerHash, DEMO_MANAGER.name, now, now
    );
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, base_postcode, trades, gst_registered, created_at)
      VALUES (?, ?, ?, ?, 'contractor', ?, '0400111222', 'Sam Plumbing', '51824753556', '', 1, ?, '3000', '["plumbing"]', 1, ?)`).run(
      contractorId, contractorOrg, DEMO_CONTRACTOR.email, contractorHash, DEMO_CONTRACTOR.name, now, now
    );
    db.prepare(`INSERT INTO buildings (id, organisation_id, world, name, street_number, street, suburb, postcode, lat, lng, oc_plan, tiers_confirmed, created_at)
      VALUES (?, ?, 'common', 'Harbour View Apartments', '42', 'Collins Street', 'Melbourne', '3000', ?, ?, 'PS 41288', 1, ?)`).run(
      buildingId, managerOrg, centre ? centre.lat : null, centre ? centre.lng : null, now
    );
    db.prepare("INSERT INTO building_assignments (user_id, building_id) VALUES (?, ?)").run(managerId, buildingId);
    const payload = JSON.stringify({ safety: ["no", "no", "no", "no", "no", "no", "no"], photos: 0, date: visit, phone: "0418000111" });
    db.prepare(`INSERT INTO jobs (id, organisation_id, building_id, created_by, title, area, trade_id, instructions, urgency, quote_deadline, payload, created_at)
      VALUES (?, ?, ?, ?, 'Dripping lobby tap', 'Level 2 lobby tap', 'plumbing', 'The lobby mixer drips all day.', 'standard', ?, ?, ?)`).run(
      openJobId, managerOrg, buildingId, managerId, visit, payload, now
    );
    db.prepare(`INSERT INTO jobs (id, organisation_id, building_id, created_by, title, area, trade_id, instructions, urgency, quote_deadline, payload, created_at)
      VALUES (?, ?, ?, ?, 'Garden tap will not turn off', 'Bin room', 'plumbing', 'The garden tap near the bins runs on its own.', 'standard', ?, ?, ?)`).run(
      quotedJobId, managerOrg, buildingId, managerId, visit, payload, now
    );
    db.prepare(`INSERT INTO quotes (id, job_id, contractor_user_id, price_cents, deposit_type, deposit_cents, start_date, start_time, duration, scope, note, created_at)
      VALUES (?, ?, ?, 40000, '25', 10000, ?, '09:00', '2h', ?, 'I can bring a washer.', ?)`).run(
      quoteId, quotedJobId, contractorId, visit, JSON.stringify(["Replace the washer"]), now
    );
    db.prepare(`INSERT INTO places (id, building_id, organisation_id, kind, name, level, token, created_at)
      VALUES (?, ?, ?, 'lift', 'Lift 1', 'Ground', ?, ?)`).run(placeId, buildingId, managerOrg, DEMO_QR_TOKEN, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { seeded: true };
}
