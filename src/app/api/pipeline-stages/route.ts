import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import {
  ensureDefaultStages,
  listStages,
  PIPELINE_KEYS,
  type PipelineKey,
} from "@/lib/pipelines";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;

  await ensureDefaultStages(user.organization_id);
  const key = req.nextUrl.searchParams.get("pipeline") as PipelineKey | null;
  const stages = await listStages(
    user.organization_id,
    key && PIPELINE_KEYS.includes(key) ? key : undefined,
  );
  return json({ stages });
}

const createSchema = z.object({
  pipelineKey: z.enum(["lead", "opportunity", "event_sales", "event_delegate"]),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(999).optional(),
  probability: z.number().int().min(0).max(100).default(0),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "org:manage");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const bool = (v: boolean) => (db.driver === "postgres" ? v : v ? 1 : 0);
  const id = newId();
  const sort =
    parsed.data.sortOrder ??
    Number(
      (
        await db
          .prepare<{ c: number | string }>(
            `SELECT COUNT(*) as c FROM pipeline_stages
             WHERE organization_id = ? AND pipeline_key = ?`,
          )
          .get(user.organization_id, parsed.data.pipelineKey)
      )?.c || 0,
    );

  try {
    await db
      .prepare(
        `INSERT INTO pipeline_stages
         (id, organization_id, pipeline_key, name, sort_order, probability, is_won, is_lost, requires_approval)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        user.organization_id,
        parsed.data.pipelineKey,
        parsed.data.name,
        sort,
        parsed.data.probability,
        bool(parsed.data.isWon),
        bool(parsed.data.isLost),
        bool(parsed.data.requiresApproval),
      );
  } catch {
    return error("Stage name already exists for this pipeline", 409);
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "pipeline_stage.created",
    entityType: "pipeline_stage",
    entityId: id,
    after: parsed.data,
  });

  return json({ id }, 201);
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req, "org:manage");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const stage = await db
    .prepare(`SELECT * FROM pipeline_stages WHERE id = ? AND organization_id = ?`)
    .get(parsed.data.id, user.organization_id);
  if (!stage) return error("Stage not found", 404);

  const bool = (v: boolean) => (db.driver === "postgres" ? v : v ? 1 : 0);
  const d = parsed.data;
  await db
    .prepare(
      `UPDATE pipeline_stages SET
         name = COALESCE(?, name),
         sort_order = COALESCE(?, sort_order),
         probability = COALESCE(?, probability),
         is_won = COALESCE(?, is_won),
         is_lost = COALESCE(?, is_lost),
         requires_approval = COALESCE(?, requires_approval)
       WHERE id = ? AND organization_id = ?`,
    )
    .run(
      d.name ?? null,
      d.sortOrder ?? null,
      d.probability ?? null,
      d.isWon === undefined ? null : bool(d.isWon),
      d.isLost === undefined ? null : bool(d.isLost),
      d.requiresApproval === undefined ? null : bool(d.requiresApproval),
      d.id,
      user.organization_id,
    );

  return json({ ok: true });
}
