import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { STARTING_POSTCODES } from "./area.js";
import { VICTORIA_HOLIDAYS } from "./holidays.js";

export function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

function userVersion(db) {
  const row = db.prepare("PRAGMA user_version").get();
  return Number(row.user_version || 0);
}

function migrate(db) {
  const version = userVersion(db);
  if (version < 1) {
    db.exec(`
      CREATE TABLE organisations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        world TEXT NOT NULL CHECK (world IN ('common', 'private', 'contractor', 'platform')),
        created_at TEXT NOT NULL
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('building_manager', 'oc_manager', 'property_manager', 'contractor', 'platform_owner')),
        name TEXT NOT NULL,
        mobile TEXT NOT NULL DEFAULT '',
        business_name TEXT NOT NULL DEFAULT '',
        abn TEXT NOT NULL DEFAULT '',
        payment_method TEXT NOT NULL DEFAULT '',
        consent INTEGER NOT NULL DEFAULT 0,
        email_verified_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE email_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE login_attempts (
        email TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT
      );
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id),
        author_id TEXT NOT NULL REFERENCES users(id),
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE privacy_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Received',
        created_at TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        actor_id TEXT,
        organisation_id TEXT,
        action TEXT NOT NULL,
        subject_type TEXT,
        subject_id TEXT,
        detail TEXT NOT NULL
      );
    `);
    db.exec("PRAGMA user_version = 1");
  }
  if (userVersion(db) < 2) {
    db.exec(`
      CREATE TABLE regions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        time_zone TEXT NOT NULL
      );
      CREATE TABLE public_holidays (
        region_id TEXT NOT NULL REFERENCES regions(id),
        day TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (region_id, day)
      );
      CREATE TABLE service_postcodes (
        postcode TEXT PRIMARY KEY
      );
      CREATE TABLE buildings (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id),
        world TEXT NOT NULL CHECK (world IN ('common', 'private')),
        name TEXT NOT NULL,
        street_number TEXT NOT NULL,
        street TEXT NOT NULL,
        suburb TEXT NOT NULL,
        postcode TEXT NOT NULL,
        lat REAL,
        lng REAL,
        oc_plan TEXT NOT NULL DEFAULT '',
        quotes_wanted INTEGER NOT NULL DEFAULT 1,
        tier1_cents INTEGER NOT NULL DEFAULT 99900,
        tier1_quotes INTEGER NOT NULL DEFAULT 1,
        tier2_cents INTEGER NOT NULL DEFAULT 499900,
        tier2_quotes INTEGER NOT NULL DEFAULT 2,
        tier3_cents INTEGER NOT NULL DEFAULT 3000000,
        tier3_quotes INTEGER NOT NULL DEFAULT 3,
        tiers_confirmed INTEGER NOT NULL DEFAULT 0,
        open_time TEXT NOT NULL DEFAULT '08:00',
        close_time TEXT NOT NULL DEFAULT '17:00',
        weekends INTEGER NOT NULL DEFAULT 0,
        access_note TEXT NOT NULL DEFAULT '',
        capture_m INTEGER NOT NULL DEFAULT 150,
        archived INTEGER NOT NULL DEFAULT 0,
        region_id TEXT NOT NULL DEFAULT 'AU-VIC',
        created_at TEXT NOT NULL
      );
      CREATE INDEX buildings_org ON buildings(organisation_id);
      CREATE TABLE building_assignments (
        user_id TEXT NOT NULL REFERENCES users(id),
        building_id TEXT NOT NULL REFERENCES buildings(id),
        PRIMARY KEY (user_id, building_id)
      );
      CREATE TABLE waiting_places (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        street_number TEXT NOT NULL,
        street TEXT NOT NULL,
        suburb TEXT NOT NULL,
        postcode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO regions (id, name, time_zone) VALUES ('AU-VIC', 'Victoria', 'Australia/Melbourne')").run();
    const holiday = db.prepare("INSERT INTO public_holidays (region_id, day, name) VALUES ('AU-VIC', ?, ?)");
    for (const [day, name] of VICTORIA_HOLIDAYS) holiday.run(day, name);
    const postcode = db.prepare("INSERT INTO service_postcodes (postcode) VALUES (?)");
    for (const code of STARTING_POSTCODES) postcode.run(code);
    db.exec("PRAGMA user_version = 2");
  }
  if (userVersion(db) < 3) {
    db.exec(`
      ALTER TABLE users ADD COLUMN base_postcode TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN trades TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE users ADD COLUMN gst_registered INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE buildings ADD COLUMN dep_cap INTEGER;
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id),
        building_id TEXT NOT NULL REFERENCES buildings(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        area TEXT NOT NULL,
        trade_id TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '',
        urgency TEXT NOT NULL DEFAULT 'standard',
        stage TEXT NOT NULL DEFAULT 'open',
        approved_cents INTEGER,
        awarded_quote_id TEXT,
        contractor_user_id TEXT,
        needs_prepay INTEGER NOT NULL DEFAULT 0,
        pay_after INTEGER NOT NULL DEFAULT 1,
        quote_deadline TEXT,
        review_ends_at TEXT,
        fewer_reason TEXT NOT NULL DEFAULT '',
        owner_approval INTEGER NOT NULL DEFAULT 0,
        approvals TEXT NOT NULL DEFAULT '{}',
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX jobs_org ON jobs(organisation_id);
      CREATE INDEX jobs_building ON jobs(building_id);
      CREATE TABLE quotes (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        contractor_user_id TEXT NOT NULL REFERENCES users(id),
        price_cents INTEGER NOT NULL,
        deposit_type TEXT NOT NULL DEFAULT 'none',
        deposit_cents INTEGER NOT NULL DEFAULT 0,
        start_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        duration TEXT NOT NULL DEFAULT '2h',
        scope TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL
      );
      CREATE TABLE job_messages (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        contractor_user_id TEXT NOT NULL,
        author_user_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        at TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        body TEXT NOT NULL
      );
    `);
    db.exec("PRAGMA user_version = 3");
  }
}

export function audit(db, event) {
  db.prepare(`INSERT INTO audit_events (at, actor_id, organisation_id, action, subject_type, subject_id, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    new Date().toISOString(),
    event.actorId || null,
    event.organisationId || null,
    event.action,
    event.subjectType || null,
    event.subjectId || null,
    JSON.stringify(event.detail || {})
  );
}
