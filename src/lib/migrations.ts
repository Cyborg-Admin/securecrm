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
}
