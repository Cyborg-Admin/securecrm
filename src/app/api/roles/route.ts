import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "roles:manage");
  if (isResponse(user)) return user;
  const db = await getDbAsync();

  const roles = await db
    .prepare<{
      id: string;
      name: string;
      description: string | null;
      is_system: number | boolean;
    }>(
      `SELECT id, name, description, is_system FROM roles
       WHERE organization_id = ? ORDER BY name`,
    )
    .all(user.organization_id);

  const withPerms = [];
  for (const role of roles) {
    const perms = await db
      .prepare<{ code: string }>(
        `SELECT p.code FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?
         ORDER BY p.code`,
      )
      .all(role.id);
    withPerms.push({
      ...role,
      permissions: perms.map((p) => p.code),
    });
  }

  return json({
    roles: withPerms,
    allPermissions: PERMISSIONS,
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string()).max(80).default([]),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "roles:manage");
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
  const exists = await db
    .prepare(`SELECT id FROM roles WHERE organization_id = ? AND name = ?`)
    .get(user.organization_id, parsed.data.name);
  if (exists) return error("Role name already exists", 409);

  const id = newId();
  const boolFalse = db.driver === "postgres" ? false : 0;
  await db
    .prepare(
      `INSERT INTO roles (id, organization_id, name, description, is_system)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.organization_id,
      parsed.data.name,
      parsed.data.description ?? null,
      boolFalse,
    );

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

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "role.created",
    entityType: "role",
    entityId: id,
    after: parsed.data,
  });

  return json({ id }, 201);
}
