-- =============================================================================
-- KINETIC — PostgreSQL setup
-- Usage:
--   1. createdb kinetic
--   2. psql -d kinetic -f database/postgres/setup.sql
--   3. Set DB_DRIVER=postgres and DATABASE_URL in .env
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  csrf_secret     TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE TABLE IF NOT EXISTS magic_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_links_user ON magic_links(user_id);

CREATE TABLE IF NOT EXISTS companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  name_normalized   TEXT NOT NULL,
  domain            TEXT,
  domain_normalized TEXT,
  industry          TEXT,
  website           TEXT,
  linkedin_url      TEXT,
  employee_count    TEXT,
  location          TEXT,
  owner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_companies_org_domain
  ON companies(organization_id, domain_normalized);
CREATE INDEX IF NOT EXISTS idx_companies_org_owner
  ON companies(organization_id, owner_user_id);

CREATE TABLE IF NOT EXISTS leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linkedin_uid      TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  first_name        TEXT,
  last_name         TEXT,
  job_title         TEXT,
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  company_name      TEXT,
  industry          TEXT,
  website           TEXT,
  location          TEXT,
  headline          TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  source_url        TEXT,
  status            TEXT NOT NULL DEFAULT 'new',
  owner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, linkedin_uid)
);

CREATE INDEX IF NOT EXISTS idx_leads_org_owner ON leads(organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_company ON leads(organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_leads_name ON leads(organization_id, full_name);

CREATE TABLE IF NOT EXISTS lead_experiences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title                 TEXT,
  company_name          TEXT,
  company_linkedin_url  TEXT,
  location              TEXT,
  started_on            TEXT,
  ended_on              TEXT,
  is_current            BOOLEAN NOT NULL DEFAULT FALSE,
  raw_text              TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_experiences_org_lead
  ON lead_experiences(organization_id, lead_id);

CREATE TABLE IF NOT EXISTS scrape_recipes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  fields_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_recipes_org_source
  ON scrape_recipes(organization_id, source, is_active);

CREATE TABLE IF NOT EXISTS contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  linkedin_uid      TEXT,
  full_name         TEXT NOT NULL,
  job_title         TEXT,
  email             TEXT,
  phone             TEXT,
  owner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_org_linkedin
  ON contacts(organization_id, linkedin_uid)
  WHERE linkedin_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_org_email ON contacts(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_org_name ON contacts(organization_id, full_name);

CREATE TABLE IF NOT EXISTS ownership_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company')),
  entity_id       UUID NOT NULL,
  from_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  ip_address      TEXT,
  user_agent      TEXT,
  before_json     JSONB,
  after_json      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at);

CREATE TABLE IF NOT EXISTS entity_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company')),
  entity_id       TEXT NOT NULL,
  activity_type   TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  dedupe_key      TEXT,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_org_entity
  ON entity_activities(organization_id, entity_type, entity_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_org_dedupe
  ON entity_activities(organization_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  href            TEXT,
  entity_type     TEXT,
  entity_id       TEXT,
  metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(organization_id, user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS automations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  trigger_type    TEXT NOT NULL,
  trigger_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',
  context_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json     JSONB,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  key_prefix      TEXT NOT NULL,
  scopes_json     JSONB NOT NULL DEFAULT '["extension:capture","extension:match"]'::jsonb,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capture_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,
  source_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'running',
  total_captured  INTEGER NOT NULL DEFAULT 0,
  total_created   INTEGER NOT NULL DEFAULT 0,
  total_updated   INTEGER NOT NULL DEFAULT 0,
  total_skipped   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_key      TEXT NOT NULL CHECK (pipeline_key IN ('opportunity', 'event_sales', 'event_delegate')),
  name              TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  probability       INTEGER NOT NULL DEFAULT 0,
  is_won            BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost           BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, pipeline_key, name)
);

CREATE INDEX IF NOT EXISTS idx_stages_org_pipeline
  ON pipeline_stages(organization_id, pipeline_key, sort_order);

CREATE TABLE IF NOT EXISTS opportunities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  stage_id          UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  amount            DOUBLE PRECISION,
  currency          TEXT NOT NULL DEFAULT 'GBP',
  close_date        DATE,
  owner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_status   TEXT NOT NULL DEFAULT 'none'
                    CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected')),
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  approval_note     TEXT,
  description       TEXT,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opps_org_stage
  ON opportunities(organization_id, stage_id, updated_at);

CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'live', 'completed', 'cancelled')),
  capacity          INTEGER,
  owner_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_org_starts
  ON events(organization_id, starts_at);

CREATE TABLE IF NOT EXISTS event_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  track             TEXT NOT NULL CHECK (track IN ('sales', 'delegate')),
  registrant_type   TEXT NOT NULL CHECK (registrant_type IN ('contact', 'lead', 'opportunity')),
  registrant_id     TEXT NOT NULL,
  stage_id          UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  opportunity_id    UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered', 'confirmed', 'attended', 'cancelled', 'no_show')),
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_regs_event
  ON event_registrations(organization_id, event_id, track);
