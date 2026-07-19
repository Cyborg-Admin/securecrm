import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import {
  getActiveRecipe,
  saveRecipeVersion,
  type ScrapeSource,
} from "@/lib/scrape-recipes";

const sources = ["linkedin", "salesnav", "cognism", "gmail"] as const;

const putSchema = z.object({
  source: z.enum(sources).default("linkedin"),
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
  merge: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "extension:capture");
  if (isResponse(user)) return user;

  const source = (req.nextUrl.searchParams.get("source") ||
    "linkedin") as ScrapeSource;
  if (!sources.includes(source)) {
    return error("Invalid source", 400);
  }

  const recipe = await getActiveRecipe(user.organization_id, source);
  return json({
    source,
    recipe: recipe || { id: null, version: 0, fields: {} },
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;

  const canWrite =
    hasPermission(user, "settings:manage") ||
    hasPermission(user, "extension:capture");
  if (!canWrite) return error("Forbidden", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const source = parsed.data.source;
  let fields = parsed.data.fields;
  if (parsed.data.merge) {
    const active = await getActiveRecipe(user.organization_id, source);
    fields = { ...(active?.fields || {}), ...fields };
  }

  const row = await saveRecipeVersion({
    organizationId: user.organization_id,
    actorUserId: user.id,
    source,
    fields,
  });

  return json({
    recipe: { id: row.id, version: row.version, fields },
  });
}
