CREATE TABLE IF NOT EXISTS ops_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  service TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  actor TEXT,
  channel TEXT,
  source TEXT,
  why TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS ops_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  run_after TEXT NOT NULL,
  actor TEXT,
  channel TEXT,
  source TEXT,
  why TEXT,
  payload_json TEXT,
  result_json TEXT,
  error TEXT,
  measured_ms INTEGER,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS ops_jobs_due ON ops_jobs(status, run_after);

CREATE TABLE IF NOT EXISTS mail_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  send_id TEXT,
  contact_id TEXT,
  email TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  queued_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_payloads (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  object_kind TEXT,
  external_id TEXT,
  status TEXT,
  payload_json TEXT NOT NULL,
  why TEXT
);

CREATE TABLE IF NOT EXISTS rollup_runs (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  at TEXT NOT NULL,
  status TEXT NOT NULL,
  row_count INTEGER,
  why TEXT
);

CREATE TABLE IF NOT EXISTS mart_campaign_day (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  day TEXT NOT NULL,
  sent INTEGER NOT NULL,
  opened INTEGER NOT NULL,
  clicked INTEGER NOT NULL,
  pipeline_usd INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efficiency_samples (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  baseline_min INTEGER NOT NULL,
  measured_ms INTEGER NOT NULL,
  ratio REAL NOT NULL,
  at TEXT NOT NULL,
  why TEXT
);

CREATE TABLE IF NOT EXISTS scheduler_beats (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  next_at TEXT NOT NULL,
  last_at TEXT
);

CREATE TABLE IF NOT EXISTS command_checks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT,
  status TEXT NOT NULL,
  actor TEXT,
  updated_at TEXT NOT NULL
);
