export const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  world TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT '',
  abn TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  base_postcode TEXT NOT NULL DEFAULT '',
  trades TEXT NOT NULL DEFAULT '[]',
  gst_registered INTEGER NOT NULL DEFAULT 1,
  stripe_account_id TEXT NOT NULL DEFAULT '',
  preferences TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT '',
  keep_signed_in INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_ref TEXT NOT NULL,
  holder TEXT NOT NULL,
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  released_at TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'full',
  urgent_fee_cents INTEGER NOT NULL DEFAULT 0,
  transfer_ref TEXT NOT NULL DEFAULT '',
  authorize_expires_at TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL DEFAULT '',
  capture_requested_at TEXT NOT NULL DEFAULT '',
  funds_confirmed_at TEXT NOT NULL DEFAULT ''
);
`;
