ALTER TABLE campaigns ADD COLUMN pipeline_usd INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS actuals (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL UNIQUE,
  amount_usd INTEGER NOT NULL,
  note TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS envelopes (
  region TEXT PRIMARY KEY,
  amount_usd INTEGER NOT NULL
);

INSERT INTO envelopes(region, amount_usd) VALUES
  ('Americas', 2400000),
  ('EMEA', 1800000),
  ('APJ', 1600000),
  ('Global', 900000);

CREATE TABLE IF NOT EXISTS territories (
  country TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  ae_id TEXT NOT NULL,
  ae_name TEXT NOT NULL,
  sdr_id TEXT NOT NULL,
  sdr_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_objects (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  company TEXT,
  title TEXT,
  country TEXT,
  status TEXT,
  owner_id TEXT,
  owner_name TEXT,
  campaign_ext TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_uploads (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  accepted INTEGER NOT NULL,
  quarantined INTEGER NOT NULL,
  duplicates INTEGER NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_packets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  status TEXT NOT NULL,
  approver TEXT,
  ban TEXT NOT NULL,
  campaign_code TEXT NOT NULL,
  sow_json TEXT NOT NULL,
  open_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  channel TEXT NOT NULL,
  source_message TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actuals_campaign ON actuals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_objects_type ON crm_objects(type, campaign_ext);
CREATE INDEX IF NOT EXISTS idx_crm_queue_status ON crm_queue(status, id);
CREATE INDEX IF NOT EXISTS idx_plan_campaign ON plan_packets(campaign_id);
