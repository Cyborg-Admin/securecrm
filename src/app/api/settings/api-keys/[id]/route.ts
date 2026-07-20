import { NextRequest } from "next/server";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Soft-revoke an API key owned by the current user (tenant-scoped). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "settings:manage");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const db = await getDbAsync();
  const existing = await db
    .prepare<{
      id: string;
      name: string;
      key_prefix: string;
      revoked_at: string | null;
    }>(
      `SELECT id, name, key_prefix, revoked_at FROM api_keys
       WHERE id = ? AND organization_id = ? AND user_id = ?`,
    )
    .get(id, user.organization_id, user.id);

  if (!existing) return error("API key not found", 404);
  if (existing.revoked_at) {
    return json({ ok: true, alreadyRevoked: true });
  }

  await db
    .prepare(
      `UPDATE api_keys SET revoked_at = datetime('now')
       WHERE id = ? AND organization_id = ? AND user_id = ?`,
    )
    .run(id, user.organization_id, user.id);

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "api_key.revoked",
    entityType: "api_key",
    entityId: id,
    before: {
      name: existing.name,
      key_prefix: existing.key_prefix,
    },
  });

  return json({ ok: true });
}
