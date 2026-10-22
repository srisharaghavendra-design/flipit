CREATE TABLE IF NOT EXISTS platform_meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  industry TEXT NOT NULL,
  employees INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT NOT NULL,
  country TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  fit INTEGER NOT NULL DEFAULT 0,
  behavior INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'lead',
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS consent (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  country TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  at TEXT NOT NULL,
  current INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  program TEXT NOT NULL,
  status TEXT NOT NULL,
  owner TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  campaign_id TEXT,
  event_id TEXT,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  ref TEXT,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  requester TEXT NOT NULL,
  approver TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS sows (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  vendor TEXT NOT NULL,
  venue TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  actor TEXT NOT NULL,
  channel TEXT NOT NULL,
  source_message TEXT NOT NULL,
  why TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounts_region ON accounts(region);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_state_title ON contacts(state, title);
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);
CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage, score);
CREATE INDEX IF NOT EXISTS idx_consent_current ON consent(contact_id, current);
CREATE INDEX IF NOT EXISTS idx_activities_lookup ON activities(contact_id, kind, at);
CREATE INDEX IF NOT EXISTS idx_activities_campaign ON activities(campaign_id, kind);
CREATE INDEX IF NOT EXISTS idx_campaigns_region ON campaigns(region);
CREATE INDEX IF NOT EXISTS idx_codes_campaign ON codes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_event_log_entity ON event_log(entity, entity_id);
