import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string()).max(80).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "roles:manage");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const role = await db
    .prepare<{
      id: string;
      name: string;
      is_system: number | boolean;
    }>(`SELECT id, name, is_system FROM roles WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id);
  if (!role) return error("Role not found", 404);

  if (parsed.data.name && parsed.data.name !== role.name) {
    if (role.is_system) {
      return error("Cannot rename system roles", 400);
    }
    const clash = await db
      .prepare(
        `SELECT id FROM roles WHERE organization_id = ? AND name = ? AND id != ?`,
      )
      .get(user.organization_id, parsed.data.name, id);
    if (clash) return error("Role name already exists", 409);
    await db
      .prepare(`UPDATE roles SET name = ? WHERE id = ? AND organization_id = ?`)
      .run(parsed.data.name, id, user.organization_id);
  }

  if (parsed.data.description !== undefined) {
    await db
      .prepare(
        `UPDATE roles SET description = ? WHERE id = ? AND organization_id = ?`,
      )
      .run(parsed.data.description, id, user.organization_id);
  }

  if (parsed.data.permissions) {
    await db
      .prepare(`DELETE FROM role_permissions WHERE role_id = ?`)
      .run(id);
    const validCodes = new Set(PERMISSIONS.map((p) => p.code));
    for (const code of parsed.data.permissions) {
      if (!validCodes.has(code as PermissionCode)) continue;
      const perm = await db
        .prepare<{ id: string }>(`SELECT id FROM permissions WHERE code = ?`)
        .get(code);
      if (perm) {
        await db
          .prepare(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          )
          .run(id, perm.id);
      }
    }
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "role.updated",
    entityType: "role",
    entityId: id,
    after: parsed.data,
  });

  return json({ ok: true });
}
