import bcrypt from "bcryptjs";
import { ensureSchema, getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { PERMISSIONS, ROLE_TEMPLATES } from "@/lib/permissions";

let bootstrapped = false;

export function bootstrapApp(): void {
  if (bootstrapped) return;
  ensureSchema();
  const db = getDb();

  for (const perm of PERMISSIONS) {
    const existing = db
      .prepare<{ id: string }>("SELECT id FROM permissions WHERE code = ?")
      .get(perm.code);
    if (!existing) {
      db.prepare(
        "INSERT INTO permissions (id, code, description) VALUES (?, ?, ?)",
      ).run(newId(), perm.code, perm.description);
    }
  }

  const userCount = db
    .prepare<{ c: number }>("SELECT COUNT(*) as c FROM users")
    .get()?.c;
  if (!userCount) {
    const orgId = newId();
    const adminId = newId();
    const orgName = process.env.BOOTSTRAP_ORG_NAME || "Acme Sales";
    const orgSlug = process.env.BOOTSTRAP_ORG_SLUG || "acme";
    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com").toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "ChangeMeNow!23";
    const fullName = process.env.BOOTSTRAP_ADMIN_NAME || "System Admin";

    db.transaction(() => {
      db.prepare(
        "INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)",
      ).run(orgId, orgName, orgSlug);

      const hash = bcrypt.hashSync(password, 12);
      db.prepare(
        `INSERT INTO users (id, organization_id, email, password_hash, full_name)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(adminId, orgId, email, hash, fullName);

      seedRolesForOrg(orgId, adminId, "Admin");

      db.prepare(
        `INSERT INTO automations
         (id, organization_id, name, description, trigger_type, trigger_config, actions_json, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        newId(),
        orgId,
        "Auto-own captured leads",
        "When a lead is captured via extension, assign ownership to the capturing user.",
        "lead.captured",
        JSON.stringify({ sources: ["linkedin", "salesnav", "cognism", "gmail"] }),
        JSON.stringify([
          { type: "assign_owner", config: { mode: "actor" } },
          { type: "set_status", config: { status: "new" } },
        ]),
        adminId,
      );
    });
  }

  bootstrapped = true;
}

export function seedRolesForOrg(
  organizationId: string,
  assignAdminUserId?: string,
  assignRoleName = "Admin",
): void {
  const db = getDb();
  const permRows = db
    .prepare<{ id: string; code: string }>("SELECT id, code FROM permissions")
    .all();
  const permByCode = new Map(permRows.map((p) => [p.code, p.id]));

  for (const [roleName, codes] of Object.entries(ROLE_TEMPLATES)) {
    let role = db
      .prepare<{ id: string }>(
        "SELECT id FROM roles WHERE organization_id = ? AND name = ?",
      )
      .get(organizationId, roleName);

    if (!role) {
      const roleId = newId();
      db.prepare(
        `INSERT INTO roles (id, organization_id, name, description, is_system)
         VALUES (?, ?, ?, ?, 1)`,
      ).run(roleId, organizationId, roleName, `${roleName} system role`);
      role = { id: roleId };
    }

    for (const code of codes) {
      const permissionId = permByCode.get(code);
      if (!permissionId) continue;
      const exists = db
        .prepare(
          "SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        )
        .get(role.id, permissionId);
      if (!exists) {
        db.prepare(
          "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
        ).run(role.id, permissionId);
      }
    }

    if (assignAdminUserId && roleName === assignRoleName) {
      const linked = db
        .prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?")
        .get(assignAdminUserId, role.id);
      if (!linked) {
        db.prepare(
          "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
        ).run(assignAdminUserId, role.id);
      }
    }
  }
}
