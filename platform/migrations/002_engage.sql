CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sends (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  actor TEXT NOT NULL,
  channel TEXT NOT NULL,
  source_message TEXT NOT NULL,
  sent INTEGER NOT NULL,
  held INTEGER NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS send_recipients (
  token TEXT PRIMARY KEY,
  send_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  email TEXT NOT NULL,
  opened INTEGER NOT NULL DEFAULT 0,
  clicked INTEGER NOT NULL DEFAULT 0,
  mail_id INTEGER,
  FOREIGN KEY (send_id) REFERENCES sends(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  campaign_id TEXT NOT NULL,
  event_id TEXT,
  title TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  steps_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journey_members (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  next_at TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (journey_id, contact_id)
);

CREATE TABLE IF NOT EXISTS ask_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ask_id TEXT NOT NULL,
  module TEXT NOT NULL,
  text TEXT NOT NULL,
  ms INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipients_send ON send_recipients(send_id);
CREATE INDEX IF NOT EXISTS idx_ask_runs_id ON ask_runs(ask_id, ok);
