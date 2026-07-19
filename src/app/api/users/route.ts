import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  password: z.string().min(10).max(200),
  roleName: z.enum(["Admin", "Manager", "Rep", "Viewer"]).default("Rep"),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "users:read");
  if (isResponse(user)) return user;
  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, u.created_at,
              GROUP_CONCAT(r.name, ',') as roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.organization_id = ?
       GROUP BY u.id
       ORDER BY u.full_name`,
    )
    .all(user.organization_id);
  return json({ users });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "users:write");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  const exists = db
    .prepare(
      "SELECT id FROM users WHERE organization_id = ? AND email = ?",
    )
    .get(user.organization_id, email);
  if (exists) return error("User already exists", 409);

  const id = newId();
  const hash = bcrypt.hashSync(parsed.data.password, 12);
  db.prepare(
    `INSERT INTO users (id, organization_id, email, password_hash, full_name)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, user.organization_id, email, hash, parsed.data.fullName);

  const role = db
    .prepare<{ id: string }>(
      "SELECT id FROM roles WHERE organization_id = ? AND name = ?",
    )
    .get(user.organization_id, parsed.data.roleName);

  if (role && user.permissions.includes("users:assign_roles")) {
    db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(
      id,
      role.id,
    );
  } else if (role) {
    const rep = db
      .prepare<{ id: string }>(
        "SELECT id FROM roles WHERE organization_id = ? AND name = 'Rep'",
      )
      .get(user.organization_id);
    if (rep) {
      db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(
        id,
        rep.id,
      );
    }
  }

  writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "user.created",
    entityType: "user",
    entityId: id,
    after: { email, fullName: parsed.data.fullName, role: parsed.data.roleName },
  });

  return json({ id, email, fullName: parsed.data.fullName }, 201);
}
