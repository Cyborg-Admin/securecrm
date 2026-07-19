import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { parseJsonObject } from "@/lib/json";
import { writeAudit } from "@/lib/audit";

export type ScrapeSource = "linkedin" | "salesnav" | "cognism" | "gmail";

export type FieldRecipe = {
  css?: string;
  jsonPath?: string;
  regex?: string;
  attribute?: string;
  note?: string;
};

export type RecipeFields = Record<string, FieldRecipe>;

export type ScrapeRecipeRow = {
  id: string;
  organization_id: string;
  source: string;
  version: number;
  is_active: number | boolean;
  fields_json: string | Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

export async function getActiveRecipe(
  organizationId: string,
  source: ScrapeSource,
): Promise<{ id: string; version: number; fields: RecipeFields } | null> {
  const db = await getDbAsync();
  const row = await db
    .prepare<ScrapeRecipeRow>(
      `SELECT * FROM scrape_recipes
       WHERE organization_id = ? AND source = ? AND is_active = ?
       ORDER BY version DESC LIMIT 1`,
    )
    .get(organizationId, source, db.driver === "postgres" ? true : 1);

  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    fields: parseJsonObject(row.fields_json) as RecipeFields,
  };
}

export async function listRecipes(
  organizationId: string,
  source?: ScrapeSource,
): Promise<ScrapeRecipeRow[]> {
  const db = await getDbAsync();
  if (source) {
    return db
      .prepare<ScrapeRecipeRow>(
        `SELECT * FROM scrape_recipes
         WHERE organization_id = ? AND source = ?
         ORDER BY version DESC`,
      )
      .all(organizationId, source);
  }
  return db
    .prepare<ScrapeRecipeRow>(
      `SELECT * FROM scrape_recipes
       WHERE organization_id = ?
       ORDER BY source ASC, version DESC`,
    )
    .all(organizationId);
}

/** Save a new active version; deactivate previous active for that source. */
export async function saveRecipeVersion(input: {
  organizationId: string;
  actorUserId: string;
  source: ScrapeSource;
  fields: RecipeFields;
}): Promise<ScrapeRecipeRow> {
  const db = await getDbAsync();
  const boolTrue = db.driver === "postgres" ? true : 1;
  const boolFalse = db.driver === "postgres" ? false : 0;

  const latest = await db
    .prepare<{ version: number }>(
      `SELECT version FROM scrape_recipes
       WHERE organization_id = ? AND source = ?
       ORDER BY version DESC LIMIT 1`,
    )
    .get(input.organizationId, input.source);

  const version = (latest?.version || 0) + 1;
  const id = newId();

  await db
    .prepare(
      `UPDATE scrape_recipes SET is_active = ?, updated_at = datetime('now')
       WHERE organization_id = ? AND source = ? AND is_active = ?`,
    )
    .run(boolFalse, input.organizationId, input.source, boolTrue);

  await db
    .prepare(
      `INSERT INTO scrape_recipes
       (id, organization_id, source, version, is_active, fields_json, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.organizationId,
      input.source,
      version,
      boolTrue,
      JSON.stringify(input.fields || {}),
      input.actorUserId,
    );

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "scrape_recipe.updated",
    entityType: "scrape_recipe",
    entityId: id,
    after: { source: input.source, version },
  });

  const row = await db
    .prepare<ScrapeRecipeRow>(`SELECT * FROM scrape_recipes WHERE id = ?`)
    .get(id);
  return row!;
}

export async function setActiveRecipeVersion(input: {
  organizationId: string;
  actorUserId: string;
  recipeId: string;
}): Promise<ScrapeRecipeRow | null> {
  const db = await getDbAsync();
  const boolTrue = db.driver === "postgres" ? true : 1;
  const boolFalse = db.driver === "postgres" ? false : 0;

  const row = await db
    .prepare<ScrapeRecipeRow>(
      `SELECT * FROM scrape_recipes WHERE id = ? AND organization_id = ?`,
    )
    .get(input.recipeId, input.organizationId);
  if (!row) return null;

  await db
    .prepare(
      `UPDATE scrape_recipes SET is_active = ?, updated_at = datetime('now')
       WHERE organization_id = ? AND source = ? AND is_active = ?`,
    )
    .run(boolFalse, input.organizationId, row.source, boolTrue);

  await db
    .prepare(
      `UPDATE scrape_recipes SET is_active = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(boolTrue, input.actorUserId, row.id, input.organizationId);

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "scrape_recipe.activated",
    entityType: "scrape_recipe",
    entityId: row.id,
    after: { source: row.source, version: row.version },
  });

  return (
    (await db
      .prepare<ScrapeRecipeRow>(`SELECT * FROM scrape_recipes WHERE id = ?`)
      .get(row.id)) || null
  );
}
