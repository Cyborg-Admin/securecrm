-- =============================================================================
-- SecureCRM — Core Schema (SQLite-compatible)
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
  linkedin_uid      TEXT NOT NULL,
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
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organization_id, linkedin_uid)
);

CREATE INDEX IF NOT EXISTS idx_leads_org_owner ON leads(organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_company ON leads(organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_leads_name ON leads(organization_id, full_name);

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
