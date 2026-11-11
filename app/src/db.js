import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
