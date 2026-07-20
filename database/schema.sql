-- =============================================================================
-- KINETIC — Core Schema (SQLite-compatible)
-- Multi-tenant, RBAC, audit, automation, companies/leads/contacts
-- For PostgreSQL, run database/postgres/setup.sql after adapting types, OR
-- set DB_DRIVER=postgres and use the migrator which applies this dialect file.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- Tenancy
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  features_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Identity & RBAC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS roles (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_system       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  csrf_secret     TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT,
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE TABLE IF NOT EXISTS magic_links (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  consumed_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_links_user ON magic_links(user_id);

-- -----------------------------------------------------------------------------
-- Companies (shared object graph + duplicate detection)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  name_normalized   TEXT NOT NULL,
  domain            TEXT,
  domain_normalized TEXT,
  industry          TEXT,
  website           TEXT,
  linkedin_url      TEXT,
  employee_count    TEXT,
  location          TEXT,
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_companies_org_domain
  ON companies(organization_id, domain_normalized);

CREATE INDEX IF NOT EXISTS idx_companies_org_owner
  ON companies(organization_id, owner_user_id);

-- -----------------------------------------------------------------------------
-- Leads — LinkedIn URL is the stable UID (per tenant)
-- Contact info is deferred to the contact stage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linkedin_uid      TEXT,
  email             TEXT,
  full_name         TEXT NOT NULL,
  first_name        TEXT,
  last_name         TEXT,
  job_title         TEXT,
  company_id        TEXT REFERENCES companies(id) ON DELETE SET NULL,
  company_name      TEXT,
  industry          TEXT,
  website           TEXT,
  location          TEXT,
  headline          TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  source_url        TEXT,
  status            TEXT NOT NULL DEFAULT 'new',
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_linkedin
  ON leads(organization_id, linkedin_uid)
  WHERE linkedin_uid IS NOT NULL AND linkedin_uid != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_email
  ON leads(organization_id, email)
  WHERE email IS NOT NULL AND email != '';
CREATE INDEX IF NOT EXISTS idx_leads_org_owner ON leads(organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_company ON leads(organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_leads_name ON leads(organization_id, full_name);

-- Previous appointments / roles scraped from LinkedIn Experience
CREATE TABLE IF NOT EXISTS lead_experiences (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id               TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title                 TEXT,
  company_name          TEXT,
  company_linkedin_url  TEXT,
  company_logo_url      TEXT,
  location              TEXT,
  started_on            TEXT,
  ended_on              TEXT,
  started_on_sort       TEXT,
  ended_on_sort         TEXT,
  is_current            INTEGER NOT NULL DEFAULT 0,
  raw_text              TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_experiences_org_lead
  ON lead_experiences(organization_id, lead_id);

-- Owner-trainable scrape field maps (per source)
CREATE TABLE IF NOT EXISTS scrape_recipes (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       INTEGER NOT NULL DEFAULT 1,
  fields_json     TEXT NOT NULL DEFAULT '{}',
  updated_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scrape_recipes_org_source
  ON scrape_recipes(organization_id, source, is_active);

-- -----------------------------------------------------------------------------
-- Contacts — enriched later (email/phone). May link to lead + company.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id           TEXT REFERENCES leads(id) ON DELETE SET NULL,
  company_id        TEXT REFERENCES companies(id) ON DELETE SET NULL,
  linkedin_uid      TEXT,
  full_name         TEXT NOT NULL,
  job_title         TEXT,
  email             TEXT,
  phone             TEXT,
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_linkedin
  ON contacts(organization_id, linkedin_uid)
  WHERE linkedin_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_org_email
  ON contacts(organization_id, email);

CREATE INDEX IF NOT EXISTS idx_contacts_org_name
  ON contacts(organization_id, full_name);

-- -----------------------------------------------------------------------------
-- Ownership history (accountability)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company')),
  entity_id       TEXT NOT NULL,
  from_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  to_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Audit log (security + accountability)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  ip_address      TEXT,
  user_agent      TEXT,
  before_json     TEXT,
  after_json      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created
  ON audit_logs(organization_id, created_at);

-- CRM activity timeline (emails scanned, notes, etc.)
CREATE TABLE IF NOT EXISTS entity_activities (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company')),
  entity_id       TEXT NOT NULL,
  activity_type   TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  dedupe_key      TEXT,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activities_org_entity
  ON entity_activities(organization_id, entity_type, entity_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_org_dedupe
  ON entity_activities(organization_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Email conversation threads (Gmail / Outlook / manual)
CREATE TABLE IF NOT EXISTS email_threads (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'gmail',
  external_thread_id TEXT,
  subject           TEXT NOT NULL DEFAULT '',
  snippet           TEXT,
  participants_json TEXT NOT NULL DEFAULT '[]',
  last_message_at   TEXT,
  source_url        TEXT,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_threads_org_external
  ON email_threads(organization_id, provider, external_thread_id)
  WHERE external_thread_id IS NOT NULL AND external_thread_id != '';
CREATE INDEX IF NOT EXISTS idx_email_threads_org_last
  ON email_threads(organization_id, last_message_at);

CREATE TABLE IF NOT EXISTS email_messages (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id         TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'gmail',
  external_message_id TEXT,
  subject           TEXT,
  from_email        TEXT,
  from_name         TEXT,
  to_emails_json    TEXT NOT NULL DEFAULT '[]',
  cc_emails_json    TEXT NOT NULL DEFAULT '[]',
  snippet           TEXT,
  body_text         TEXT,
  source_url        TEXT,
  direction         TEXT,
  sent_at           TEXT,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_org_external
  ON email_messages(organization_id, provider, external_message_id)
  WHERE external_message_id IS NOT NULL AND external_message_id != '';
CREATE INDEX IF NOT EXISTS idx_email_messages_thread
  ON email_messages(thread_id, sent_at);

CREATE TABLE IF NOT EXISTS email_thread_links (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id         TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company')),
  entity_id         TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, thread_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_email_thread_links_entity
  ON email_thread_links(organization_id, entity_type, entity_id);

-- In-app notifications (per user, tenant-scoped)
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  href            TEXT,
  entity_type     TEXT,
  entity_id       TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  read_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(organization_id, user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at);

-- -----------------------------------------------------------------------------
-- Automation engine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automations (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  trigger_type    TEXT NOT NULL,
  trigger_config  TEXT NOT NULL DEFAULT '{}',
  actions_json    TEXT NOT NULL DEFAULT '[]',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id   TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',
  context_json    TEXT NOT NULL DEFAULT '{}',
  result_json     TEXT,
  error_message   TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Extension API keys (scoped tokens for Chrome extension)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  key_prefix      TEXT NOT NULL,
  scopes_json     TEXT NOT NULL DEFAULT '["extension:capture","extension:match"]',
  last_used_at    TEXT,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Capture batches (bulk scrape sessions from extension)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capture_batches (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,
  source_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'running',
  total_captured  INTEGER NOT NULL DEFAULT 0,
  total_created   INTEGER NOT NULL DEFAULT 0,
  total_updated   INTEGER NOT NULL DEFAULT 0,
  total_skipped   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT
);

-- -----------------------------------------------------------------------------
-- Pipeline stages (opportunities + event tracks)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_key      TEXT NOT NULL CHECK (pipeline_key IN ('lead', 'opportunity', 'event_sales', 'event_delegate')),
  name              TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  probability       INTEGER NOT NULL DEFAULT 0,
  is_won            INTEGER NOT NULL DEFAULT 0,
  is_lost           INTEGER NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, pipeline_key, name)
);

CREATE INDEX IF NOT EXISTS idx_stages_org_pipeline
  ON pipeline_stages(organization_id, pipeline_key, sort_order);

-- -----------------------------------------------------------------------------
-- Opportunities
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opportunities (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  company_id        TEXT REFERENCES companies(id) ON DELETE SET NULL,
  contact_id        TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  stage_id          TEXT REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  amount            REAL,
  currency          TEXT NOT NULL DEFAULT 'GBP',
  close_date        TEXT,
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  approval_status   TEXT NOT NULL DEFAULT 'none'
                    CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected')),
  approved_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TEXT,
  approval_note     TEXT,
  description       TEXT,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opps_org_stage
  ON opportunities(organization_id, stage_id, updated_at);

-- -----------------------------------------------------------------------------
-- Events + registrations (sales & delegate tracks)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  starts_at         TEXT,
  ends_at           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'live', 'completed', 'cancelled')),
  capacity          INTEGER,
  owner_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_org_starts
  ON events(organization_id, starts_at);

CREATE TABLE IF NOT EXISTS event_registrations (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  track             TEXT NOT NULL CHECK (track IN ('sales', 'delegate')),
  registrant_type   TEXT NOT NULL CHECK (registrant_type IN ('contact', 'lead', 'opportunity')),
  registrant_id     TEXT NOT NULL,
  stage_id          TEXT REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  opportunity_id    TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered', 'confirmed', 'attended', 'cancelled', 'no_show')),
  notes             TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_event_regs_event
  ON event_registrations(organization_id, event_id, track);

-- -----------------------------------------------------------------------------
-- Product catalogue + opportunity line items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku               TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT,
  unit_price        REAL NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'GBP',
  is_active         INTEGER NOT NULL DEFAULT 1,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_sku
  ON products(organization_id, sku)
  WHERE sku IS NOT NULL AND sku != '';
CREATE INDEX IF NOT EXISTS idx_products_org_name
  ON products(organization_id, name);

CREATE TABLE IF NOT EXISTS opportunity_line_items (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id    TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity          REAL NOT NULL DEFAULT 1,
  unit_price        REAL NOT NULL DEFAULT 0,
  discount          REAL NOT NULL DEFAULT 0,
  line_total        REAL NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opp_lines_opp
  ON opportunity_line_items(organization_id, opportunity_id);
