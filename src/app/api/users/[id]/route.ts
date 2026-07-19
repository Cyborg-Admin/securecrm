import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  roleName: z.string().min(1).max(80).optional(),
  password: z.string().min(10).max(200).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "users:write");
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
  const target = await db
    .prepare(
      `SELECT id, email, full_name, is_active FROM users
       WHERE id = ? AND organization_id = ?`,
    )
    .get(id, user.organization_id) as
    | { id: string; email: string; full_name: string; is_active: number | boolean }
    | undefined;
  if (!target) return error("User not found", 404);

  if (parsed.data.fullName) {
    await db
      .prepare(
        `UPDATE users SET full_name = ?, updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(parsed.data.fullName, id, user.organization_id);
  }

  if (parsed.data.isActive !== undefined) {
    if (id === user.id && !parsed.data.isActive) {
      return error("You cannot deactivate yourself", 400);
    }
    const boolVal =
      db.driver === "postgres" ? parsed.data.isActive : parsed.data.isActive ? 1 : 0;
    await db
      .prepare(
        `UPDATE users SET is_active = ?, updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(boolVal, id, user.organization_id);
  }

  if (parsed.data.password) {
    const hash = bcrypt.hashSync(parsed.data.password, 12);
    await db
      .prepare(
        `UPDATE users SET password_hash = ?, updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(hash, id, user.organization_id);
  }

  if (parsed.data.roleName) {
    if (!user.permissions.includes("users:assign_roles")) {
      return error("Forbidden", 403, { permission: "users:assign_roles" });
    }
    const role = await db
      .prepare<{ id: string }>(
        `SELECT id FROM roles WHERE organization_id = ? AND name = ?`,
      )
      .get(user.organization_id, parsed.data.roleName);
    if (!role) return error("Role not found", 404);
    await db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).run(id);
    await db
      .prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`)
      .run(id, role.id);
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "user.updated",
    entityType: "user",
    entityId: id,
    before: target,
    after: parsed.data,
  });

  return json({ ok: true });
}
