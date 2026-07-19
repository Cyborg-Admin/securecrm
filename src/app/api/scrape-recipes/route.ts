import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import {
  getActiveRecipe,
  listRecipes,
  saveRecipeVersion,
  setActiveRecipeVersion,
  type ScrapeSource,
} from "@/lib/scrape-recipes";
import { parseJsonObject } from "@/lib/json";

const sources = ["linkedin", "salesnav", "cognism", "gmail"] as const;

const putSchema = z.object({
  source: z.enum(sources),
  fields: z.record(
    z.string(),
    z.object({
      css: z.string().max(500).optional(),
      jsonPath: z.string().max(300).optional(),
      regex: z.string().max(300).optional(),
      attribute: z.string().max(80).optional(),
      note: z.string().max(500).optional(),
    }),
  ),
});

const activateSchema = z.object({
  recipeId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "settings:manage");
  if (isResponse(user)) return user;

  const source = req.nextUrl.searchParams.get("source") as ScrapeSource | null;
  const activeOnly = req.nextUrl.searchParams.get("active") === "1";

  if (activeOnly && source && sources.includes(source)) {
    const active = await getActiveRecipe(user.organization_id, source);
    return json({ recipe: active });
  }

  const recipes = await listRecipes(
    user.organization_id,
    source && sources.includes(source) ? source : undefined,
  );
  return json({
    recipes: recipes.map((r) => ({
      ...r,
      fields: parseJsonObject(r.fields_json),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireUser(req, "settings:manage");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  if (
    body &&
    typeof body === "object" &&
    "recipeId" in body &&
    !("fields" in body)
  ) {
    const parsed = activateSchema.safeParse(body);
    if (!parsed.success) return error("Validation failed", 400);
    const row = await setActiveRecipeVersion({
      organizationId: user.organization_id,
      actorUserId: user.id,
      recipeId: parsed.data.recipeId,
    });
    if (!row) return error("Recipe not found", 404);
    return json({
      recipe: { ...row, fields: parseJsonObject(row.fields_json) },
    });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return error("Validation failed", 400, { details: parsed.error.flatten() });
  }

  const row = await saveRecipeVersion({
    organizationId: user.organization_id,
    actorUserId: user.id,
    source: parsed.data.source,
    fields: parsed.data.fields,
  });

  return json(
    { recipe: { ...row, fields: parseJsonObject(row.fields_json) } },
    201,
  );
}
