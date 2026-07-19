import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().min(8).max(200).optional(),
  newPassword: z.string().min(10).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;
  const db = await getDbAsync();

  const row = await db
    .prepare<{
      id: string;
      email: string;
      full_name: string;
      last_login_at: string | null;
      created_at: string;
    }>(
      `SELECT id, email, full_name, last_login_at, created_at
       FROM users WHERE id = ? AND organization_id = ?`,
    )
    .get(user.id, user.organization_id);

  if (!row) return error("User not found", 404);

  const org = await db
    .prepare<{ id: string; name: string; slug: string }>(
      "SELECT id, name, slug FROM organizations WHERE id = ?",
    )
    .get(user.organization_id);

  return json({
    profile: {
      ...row,
      roles: user.roles,
      permissions: user.permissions,
    },
    organization: org,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req);
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
  const existing = await db
    .prepare<{
      id: string;
      email: string;
      full_name: string;
      password_hash: string;
    }>(
      `SELECT id, email, full_name, password_hash
       FROM users WHERE id = ? AND organization_id = ?`,
    )
    .get(user.id, user.organization_id);

  if (!existing) return error("User not found", 404);

  const d = parsed.data;
  if (d.newPassword) {
    if (!d.currentPassword) {
      return error("Current password required to set a new password", 400);
    }
    const ok = bcrypt.compareSync(d.currentPassword, existing.password_hash);
    if (!ok) return error("Current password is incorrect", 403);
  }

  if (d.email && d.email.toLowerCase() !== existing.email) {
    const clash = await db
      .prepare(
        `SELECT id FROM users
         WHERE organization_id = ? AND lower(email) = lower(?) AND id != ?`,
      )
      .get(user.organization_id, d.email, user.id);
    if (clash) return error("Email already in use", 409);
  }

  const nextName = d.fullName?.trim() || existing.full_name;
  const nextEmail = d.email?.trim().toLowerCase() || existing.email;
  const nextHash = d.newPassword
    ? bcrypt.hashSync(d.newPassword, 12)
    : existing.password_hash;

  await db
    .prepare(
      `UPDATE users SET
         full_name = ?,
         email = ?,
         password_hash = ?,
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(nextName, nextEmail, nextHash, user.id, user.organization_id);

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "profile.updated",
    entityType: "user",
    entityId: user.id,
    before: { full_name: existing.full_name, email: existing.email },
    after: {
      full_name: nextName,
      email: nextEmail,
      password_changed: Boolean(d.newPassword),
    },
  });

  const profile = await db
    .prepare(
      `SELECT id, email, full_name, last_login_at, created_at
       FROM users WHERE id = ?`,
    )
    .get(user.id);

  return json({ profile, roles: user.roles });
}
