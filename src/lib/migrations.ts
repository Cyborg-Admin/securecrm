import { getDbAsync } from "@/lib/db";

async function columnExists(
  table: string,
  column: string,
): Promise<boolean> {
  const db = await getDbAsync();
  if (db.driver === "sqlite") {
    const rows = await db
      .prepare<{ name: string }>(`PRAGMA table_info(${table})`)
      .all();
    return rows.some((r) => r.name === column);
  }
  const row = await db
    .prepare<{ exists: boolean | number }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = ? AND column_name = ?
       ) as exists`,
    )
    .get(table, column);
  return Boolean(row?.exists);
}

async function tableExists(table: string): Promise<boolean> {
  const db = await getDbAsync();
  if (db.driver === "sqlite") {
    const row = await db
      .prepare<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table);
    return Boolean(row?.name);
  }
  const row = await db
    .prepare<{ exists: boolean | number }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ?
       ) as exists`,
    )
    .get(table);
  return Boolean(row?.exists);
}

async function linkedinUidIsNotNull(): Promise<boolean> {
  const db = await getDbAsync();
  if (db.driver === "sqlite") {
    const rows = await db
      .prepare<{ name: string; notnull: number }>(`PRAGMA table_info(leads)`)
      .all();
    const col = rows.find((r) => r.name === "linkedin_uid");
    return Boolean(col && col.notnull === 1);
  }
  const row = await db
    .prepare<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'leads' AND column_name = 'linkedin_uid'`,
    )
    .get();
  return row?.is_nullable === "NO";
}

async function ensureEmailTables(): Promise<void> {
  const db = await getDbAsync();
  if (await tableExists("email_threads")) return;

  if (db.driver === "sqlite") {
    await db.exec(`
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
`);
    return;
  }

  await db.exec(`
CREATE TABLE IF NOT EXISTS email_threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'gmail',
  external_thread_id TEXT,
  subject           TEXT NOT NULL DEFAULT '',
  snippet           TEXT,
  participants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_message_at   TIMESTAMPTZ,
  source_url        TEXT,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_threads_org_external
  ON email_threads(organization_id, provider, external_thread_id)
  WHERE external_thread_id IS NOT NULL AND external_thread_id != '';
CREATE INDEX IF NOT EXISTS idx_email_threads_org_last
  ON email_threads(organization_id, last_message_at);

CREATE TABLE IF NOT EXISTS email_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id         UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'gmail',
  external_message_id TEXT,
  subject           TEXT,
  from_email        TEXT,
  from_name         TEXT,
  to_emails_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_emails_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  snippet           TEXT,
  body_text         TEXT,
  source_url        TEXT,
  direction         TEXT,
  sent_at           TIMESTAMPTZ,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_org_external
  ON email_messages(organization_id, provider, external_message_id)
  WHERE external_message_id IS NOT NULL AND external_message_id != '';
CREATE INDEX IF NOT EXISTS idx_email_messages_thread
  ON email_messages(thread_id, sent_at);

CREATE TABLE IF NOT EXISTS email_thread_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id         UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'company')),
  entity_id         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, thread_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_email_thread_links_entity
  ON email_thread_links(organization_id, entity_type, entity_id);
`);
}

async function migrateLeadsIdentity(): Promise<void> {
  const db = await getDbAsync();

  if (!(await columnExists("leads", "email"))) {
    if (db.driver === "sqlite") {
      await db.exec(`ALTER TABLE leads ADD COLUMN email TEXT`);
    } else {
      await db.exec(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT`);
    }
  }

  if (db.driver === "postgres") {
    if (await linkedinUidIsNotNull()) {
      await db.exec(
        `ALTER TABLE leads ALTER COLUMN linkedin_uid DROP NOT NULL`,
      );
    }
    await db.exec(`
DO $$ BEGIN
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_organization_id_linkedin_uid_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
`);
    await db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_linkedin
  ON leads(organization_id, linkedin_uid)
  WHERE linkedin_uid IS NOT NULL AND linkedin_uid != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_email
  ON leads(organization_id, email)
  WHERE email IS NOT NULL AND email != '';
`);
    return;
  }

  // SQLite: rebuild when linkedin_uid is still NOT NULL (drops table UNIQUE).
  if (await linkedinUidIsNotNull()) {
    await db.exec(`PRAGMA foreign_keys = OFF`);
    await db.exec(`
CREATE TABLE leads__identity_mig (
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
INSERT INTO leads__identity_mig (
  id, organization_id, linkedin_uid, email, full_name, first_name, last_name,
  job_title, company_id, company_name, industry, website, location, headline,
  source, source_url, status, owner_user_id, metadata_json, created_by,
  created_at, updated_at
)
SELECT
  id, organization_id, linkedin_uid, email, full_name, first_name, last_name,
  job_title, company_id, company_name, industry, website, location, headline,
  source, source_url, status, owner_user_id, metadata_json, created_by,
  created_at, updated_at
FROM leads;
DROP TABLE leads;
ALTER TABLE leads__identity_mig RENAME TO leads;
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
`);
    await db.exec(`PRAGMA foreign_keys = ON`);
  } else {
    await db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_linkedin
  ON leads(organization_id, linkedin_uid)
  WHERE linkedin_uid IS NOT NULL AND linkedin_uid != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_email
  ON leads(organization_id, email)
  WHERE email IS NOT NULL AND email != '';
`);
  }
}

/** Additive migrations for existing deployments (CREATE IF NOT EXISTS is not enough for new columns). */
export async function runMigrations(): Promise<void> {
  const db = await getDbAsync();

  if (!(await columnExists("organizations", "settings_json"))) {
    if (db.driver === "sqlite") {
      await db.exec(
        `ALTER TABLE organizations ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}'`,
      );
    } else {
      await db.exec(
        `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
      );
    }
  }

  if (!(await columnExists("organizations", "features_json"))) {
    if (db.driver === "sqlite") {
      await db.exec(
        `ALTER TABLE organizations ADD COLUMN features_json TEXT NOT NULL DEFAULT '{}'`,
      );
    } else {
      await db.exec(
        `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS features_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
      );
    }
  }

  await migrateLeadsIdentity();
  await ensureEmailTables();
  await migrateLeadPipelineKey();
}

/** Allow pipeline_key = 'lead' on existing deployments. */
async function migrateLeadPipelineKey(): Promise<void> {
  const db = await getDbAsync();

  if (db.driver === "postgres") {
    await db.exec(`
DO $$ BEGIN
  ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_pipeline_key_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_key_check
    CHECK (pipeline_key IN ('lead', 'opportunity', 'event_sales', 'event_delegate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`);
    return;
  }

  // SQLite: rebuild only when the CHECK still excludes 'lead'
  const row = await db
    .prepare<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_stages'`,
    )
    .get();
  const sql = row?.sql || "";
  if (sql.includes("'lead'") || !sql.includes("pipeline_key")) return;

  await db.exec(`PRAGMA foreign_keys = OFF`);
  await db.exec(`
CREATE TABLE pipeline_stages__lead_mig (
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
INSERT INTO pipeline_stages__lead_mig
  SELECT id, organization_id, pipeline_key, name, sort_order, probability,
         is_won, is_lost, requires_approval, created_at
  FROM pipeline_stages;
DROP TABLE pipeline_stages;
ALTER TABLE pipeline_stages__lead_mig RENAME TO pipeline_stages;
CREATE INDEX IF NOT EXISTS idx_stages_org_pipeline
  ON pipeline_stages(organization_id, pipeline_key, sort_order);
`);
  await db.exec(`PRAGMA foreign_keys = ON`);
}
