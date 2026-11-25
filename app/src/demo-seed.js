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

export const DEMO_OC_MANAGER = {
  email: "helen.tran@riverside.example",
  password: "Riverside1",
  name: "Helen Tran"
};

export const DEMO_PROPERTY_MANAGER = {
  email: "leo.park@southbanklets.example",
  password: "Lettings1",
  name: "Leo Park"
};

export const DEMO_OWNER = {
  email: "owner@taskspeck.example",
  password: "Ownerpass1",
  name: "Nick Owner"
};

export const DEMO_QR_TOKEN = "demo-lift-1";
export const DEMO_QR_CORRIDOR = "demo-harbour-l3-7f3a9c2e1b84";
export const DEMO_QR_RIVERSIDE = "demo-riverside-gate-a91c4e77b2";

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
  const ownerOrg = newId();
  const ownerId = newId();
  const contractorOrg = newId();
  const ocOrg = newId();
  const propertyOrg = newId();
  const managerId = newId();
  const contractorId = newId();
  const ocId = newId();
  const propertyId = newId();
  const buildingId = newId();
  const ocBuildingId = newId();
  const rentalId = newId();
  const openJobId = newId();
  const quotedJobId = newId();
  const quoteId = newId();
  const placeId = newId();
  const centre = centreOf("3000");
  const southbank = centreOf("3006");
  const visit = nextWeekday();
  const managerHash = await hashPassword(DEMO_MANAGER.password);
  const contractorHash = await hashPassword(DEMO_CONTRACTOR.password);
  const ocHash = await hashPassword(DEMO_OC_MANAGER.password);
  const propertyHash = await hashPassword(DEMO_PROPERTY_MANAGER.password);
  const ownerHash = await hashPassword(DEMO_OWNER.password);

  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Harbour View OC', 'common', ?)").run(managerOrg, now);
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Platform', 'platform', ?)").run(ownerOrg, now);
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
      VALUES (?, ?, ?, ?, 'platform_owner', ?, '', 'Platform', '', '', 0, ?, ?)`).run(
      ownerId, ownerOrg, DEMO_OWNER.email, ownerHash, DEMO_OWNER.name, now, now
    );
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Sam Plumbing', 'contractor', ?)").run(contractorOrg, now);
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Riverside Owners Corporation', 'common', ?)").run(ocOrg, now);
    db.prepare("INSERT INTO organisations (id, name, world, created_at) VALUES (?, 'Southbank Lettings', 'private', ?)").run(propertyOrg, now);
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
      VALUES (?, ?, ?, ?, 'building_manager', ?, '0418000111', 'Harbour View OC', '51824753556', 'card', 1, ?, ?)`).run(
      managerId, managerOrg, DEMO_MANAGER.email, managerHash, DEMO_MANAGER.name, now, now
    );
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, base_postcode, trades, gst_registered, created_at)
      VALUES (?, ?, ?, ?, 'contractor', ?, '0400111222', 'Sam Plumbing', '51824753556', '', 1, ?, '3000', '["plumbing"]', 1, ?)`).run(
      contractorId, contractorOrg, DEMO_CONTRACTOR.email, contractorHash, DEMO_CONTRACTOR.name, now, now
    );
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
      VALUES (?, ?, ?, ?, 'oc_manager', ?, '0418222333', 'Riverside Owners Corporation', '51824753556', 'card', 1, ?, ?)`).run(
      ocId, ocOrg, DEMO_OC_MANAGER.email, ocHash, DEMO_OC_MANAGER.name, now, now
    );
    db.prepare(`INSERT INTO users (id, organisation_id, email, password_hash, role, name, mobile, business_name, abn, payment_method, consent, email_verified_at, created_at)
      VALUES (?, ?, ?, ?, 'property_manager', ?, '0418333444', 'Southbank Lettings', '51824753556', 'bank', 1, ?, ?)`).run(
      propertyId, propertyOrg, DEMO_PROPERTY_MANAGER.email, propertyHash, DEMO_PROPERTY_MANAGER.name, now, now
    );
    db.prepare(`INSERT INTO buildings (id, organisation_id, world, name, street_number, street, suburb, postcode, lat, lng, oc_plan,
      tier1_cents, tier1_quotes, tier2_cents, tier2_quotes, tier3_cents, tier3_quotes, tiers_confirmed, created_at)
      VALUES (?, ?, 'common', 'Harbour View Apartments', '42', 'Collins Street', 'Melbourne', '3000', ?, ?, 'PS 41288', 99900, 1, 499900, 2, 3000000, 3, 1, ?)`).run(
      buildingId, managerOrg, centre ? centre.lat : null, centre ? centre.lng : null, now
    );
    db.prepare("INSERT INTO building_assignments (user_id, building_id) VALUES (?, ?)").run(managerId, buildingId);
    db.prepare("UPDATE buildings SET building_use = 'residential', building_class = '2' WHERE id = ?").run(buildingId);
    db.prepare(`INSERT INTO buildings (id, organisation_id, world, name, street_number, street, suburb, postcode, lat, lng, oc_plan,
      tier1_cents, tier1_quotes, tier2_cents, tier2_quotes, tier3_cents, tier3_quotes, tiers_confirmed, created_at)
      VALUES (?, ?, 'common', 'Riverside Court', '18', 'Flinders Lane', 'Melbourne', '3000', ?, ?, 'PS 22041', 99900, 1, 499900, 2, 3000000, 3, 1, ?)`).run(
      ocBuildingId, ocOrg, centre ? centre.lat + 0.015 : null, centre ? centre.lng + 0.012 : null, now
    );
    db.prepare("INSERT INTO building_assignments (user_id, building_id) VALUES (?, ?)").run(ocId, ocBuildingId);
    db.prepare(`INSERT INTO buildings (id, organisation_id, world, name, street_number, street, suburb, postcode, lat, lng, quotes_wanted, created_at)
      VALUES (?, ?, 'private', '12 Clarendon Street rental', '12', 'Clarendon Street', 'Southbank', '3006', ?, ?, 1, ?)`).run(
      rentalId, propertyOrg, southbank ? southbank.lat : null, southbank ? southbank.lng : null, now
    );
    db.prepare("INSERT INTO building_assignments (user_id, building_id) VALUES (?, ?)").run(propertyId, rentalId);
    db.prepare("UPDATE buildings SET building_use = 'residential', building_class = '1' WHERE id = ?").run(rentalId);
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
    db.prepare(`INSERT INTO places (id, building_id, organisation_id, kind, name, level, token, created_at)
      VALUES (?, ?, ?, 'other', 'Level 3 corridor', 'Level 3', ?, ?)`).run(newId(), buildingId, managerOrg, DEMO_QR_CORRIDOR, now);
    db.prepare(`INSERT INTO places (id, building_id, organisation_id, kind, name, level, token, created_at)
      VALUES (?, ?, ?, 'doors', 'Car park gate', '', ?, ?)`).run(newId(), ocBuildingId, ocOrg, DEMO_QR_RIVERSIDE, now);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 86400000));
    const addNote = db.prepare("INSERT INTO notes (id, organisation_id, author_id, author_name, body, notice_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    addNote.run(newId(), managerOrg, managerId, DEMO_MANAGER.name, "Handover: the leak in unit 12 is with the plumber. Sam Okonkwo is due back in the morning.", today, now);
    addNote.run(newId(), managerOrg, managerId, DEMO_MANAGER.name, "The plant-room key was returned to the concierge.", yesterday, now);
    addNote.run(newId(), managerOrg, managerId, DEMO_MANAGER.name, "Plumber coming that morning for the lobby tap.", visit, now);
    db.prepare(`INSERT INTO reports (id, building_id, organisation_id, place_id, reference, kind, description, status, reporter_name, reporter_contact, unit_number, created_at)
      VALUES (?, ?, ?, ?, 'R-DEMO-1', 'lift', 'The lift door stays open on the ground floor.', 'NEW', 'Rita Resident', 'rita@example.com', '12', ?)`).run(newId(), buildingId, managerOrg, placeId, now);
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at, kind, transfer_ref)
      VALUES ('pay-demo-held', ?, ?, 22000, 3300, 18700, 'succeeded', 'demo-held', 'pi_demo_held', 'stripe', ?, 'deposit', '')`).run(openJobId, managerOrg, now);
    db.prepare(`INSERT INTO payments (id, job_id, organisation_id, amount_cents, fee_cents, net_cents, status, idempotency_key, provider_ref, holder, created_at, kind, released_at, transfer_ref)
      VALUES ('pay-demo-released', ?, ?, 18000, 2700, 15300, 'succeeded', 'demo-released', 'pi_demo_released', 'stripe', ?, 'full', ?, 'tr_demo_released')`).run(openJobId, managerOrg, now, now);
    const expiry = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO contractor_documents (id, user_id, kind, stored_name, original_name, mime, declared, declared_at, expiry_on, licence_number, suggested_expiry, suggested_number, suggested_kind, created_at)
      VALUES (?, ?, 'insurance', 'demo-policy.pdf', 'policy.pdf', 'application/pdf', 1, ?, ?, 'POL-DEMO', ?, 'POL-DEMO', 'insurance', ?)`).run(newId(), contractorId, now, expiry, expiry, now);
    db.prepare(`INSERT INTO job_messages (id, job_id, contractor_user_id, author_user_id, body, created_at)
      VALUES (?, ?, ?, ?, 'I can come tomorrow morning for the garden tap.', ?)`).run(newId(), quotedJobId, contractorId, contractorId, now);
    db.prepare(`INSERT INTO ai_uses (id, user_id, helper, model, demo, month, input_tokens, output_tokens, cost_cents, subject_type, subject_id, created_at)
      VALUES ('ai-demo', ?, 'next-step', '', 1, ?, 0, 0, 0, 'job', ?, ?)`).run(managerId, now.slice(0, 7), openJobId, now);
    db.prepare(`INSERT INTO mail_log (id, to_email, subject, body, status, error, created_at)
      VALUES ('mail-demo', ?, 'Welcome to the demo', 'This sample notice is stored so the admin mail log has a row.', 'stored', '', ?)`).run(DEMO_MANAGER.email, now);
    db.prepare(`INSERT INTO email_drafts (id, to_user_id, to_email, subject, body, status, created_at)
      VALUES ('draft-demo', ?, ?, 'About the lobby tap', 'A draft the owner can confirm before it is sent.', 'draft', ?)`).run(contractorId, DEMO_CONTRACTOR.email, now);
    db.prepare(`INSERT INTO admin_notes (id, subject_type, subject_id, body, actor_id, created_at)
      VALUES ('note-demo', 'user', ?, 'Sample note: Sam is the plumber for Harbour View.', ?, ?)`).run(contractorId, ownerId, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { seeded: true };
}
