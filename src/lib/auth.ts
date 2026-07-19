import { createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { newId, newToken } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import type { PermissionCode } from "@/lib/permissions";
import { bootstrapApp } from "@/lib/bootstrap";

export const SESSION_COOKIE = "scrm_session";
export const CSRF_COOKIE = "scrm_csrf";

export type AuthUser = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  permissions: PermissionCode[];
  roles: string[];
  session_id: string;
  csrf_secret: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionDays(): number {
  return Number(process.env.SESSION_DAYS || 14);
}

export async function loginUser(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ user: AuthUser; sessionToken: string; csrfToken: string } | null> {
  bootstrapApp();
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const user = db
    .prepare<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      password_hash: string;
      is_active: number;
    }>(
      `SELECT id, organization_id, email, full_name, password_hash, is_active
       FROM users WHERE email = ? LIMIT 1`,
    )
    .get(email);

  if (!user || !user.is_active) return null;
  const ok = bcrypt.compareSync(input.password, user.password_hash);
  if (!ok) return null;

  const sessionToken = newToken(32);
  const csrfSecret = newToken(24);
  const sessionId = newId();
  const expires = new Date(Date.now() + sessionDays() * 86400000).toISOString();

  db.prepare(
    `INSERT INTO sessions
     (id, user_id, organization_id, token_hash, csrf_secret, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    user.id,
    user.organization_id,
    hashToken(sessionToken),
    csrfSecret,
    expires,
    input.ipAddress ?? null,
    input.userAgent ?? null,
  );

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(
    user.id,
  );

  writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const authUser = loadAuthUser(user.id, sessionId, csrfSecret);
  if (!authUser) return null;
  return { user: authUser, sessionToken, csrfToken: csrfSecret };
}

export function logoutSession(sessionToken: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?",
  ).run(hashToken(sessionToken));
}

function loadAuthUser(
  userId: string,
  sessionId: string,
  csrfSecret: string,
): AuthUser | null {
  const db = getDb();
  const user = db
    .prepare<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      is_active: number;
    }>(
      `SELECT id, organization_id, email, full_name, is_active FROM users WHERE id = ?`,
    )
    .get(userId);
  if (!user || !user.is_active) return null;

  const roles = db
    .prepare<{ name: string }>(
      `SELECT r.name FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
    )
    .all(userId)
    .map((r) => r.name);

  const permissions = db
    .prepare<{ code: string }>(
      `SELECT DISTINCT p.code FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`,
    )
    .all(userId)
    .map((p) => p.code as PermissionCode);

  return {
    id: user.id,
    organization_id: user.organization_id,
    email: user.email,
    full_name: user.full_name,
    permissions,
    roles,
    session_id: sessionId,
    csrf_secret: csrfSecret,
  };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  bootstrapApp();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserFromSessionToken(token);
}

export function getUserFromSessionToken(token: string): AuthUser | null {
  const db = getDb();
  const row = db
    .prepare<{
      id: string;
      user_id: string;
      csrf_secret: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT id, user_id, csrf_secret, expires_at, revoked_at
       FROM sessions WHERE token_hash = ?`,
    )
    .get(hashToken(token));

  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return loadAuthUser(row.user_id, row.id, row.csrf_secret);
}

export function getUserFromApiKey(apiKey: string): AuthUser | null {
  bootstrapApp();
  const db = getDb();
  const keyHash = hashToken(apiKey);
  const row = db
    .prepare<{
      user_id: string;
      organization_id: string;
      revoked_at: string | null;
      scopes_json: string;
    }>(
      `SELECT user_id, organization_id, revoked_at, scopes_json
       FROM api_keys WHERE key_hash = ?`,
    )
    .get(keyHash);
  if (!row || row.revoked_at) return null;

  db.prepare(
    "UPDATE api_keys SET last_used_at = datetime('now') WHERE key_hash = ?",
  ).run(keyHash);

  const user = loadAuthUser(row.user_id, `api:${row.user_id}`, "api-key");
  if (!user) return null;

  const scopes = JSON.parse(row.scopes_json || "[]") as PermissionCode[];
  // API keys are scoped — intersect with user permissions
  user.permissions = user.permissions.filter((p) => scopes.includes(p));
  return user;
}

export function hasPermission(user: AuthUser, code: PermissionCode): boolean {
  return user.permissions.includes(code);
}

export function assertPermission(user: AuthUser, code: PermissionCode): void {
  if (!hasPermission(user, code)) {
    throw new Error(`FORBIDDEN:${code}`);
  }
}

export function verifyCsrf(user: AuthUser, provided?: string | null): boolean {
  if (!provided) return false;
  if (user.csrf_secret === "api-key") return true;
  const a = Buffer.from(user.csrf_secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
