import bcrypt from "bcryptjs";
import { getDbAsync } from "@/lib/db";
import { newId, newToken } from "@/lib/ids";
import {
  hashToken,
  isUserActive,
  createSessionForUser,
  type AuthUser,
} from "@/lib/auth";
import { appBaseUrl, sendEmail } from "@/lib/mail";
import { writeAudit } from "@/lib/audit";
import { ensurePrimaryAdmin } from "@/lib/bootstrap";

const RESET_TTL_MINUTES = 30;

export function userHasUsablePassword(passwordHash: string): boolean {
  return Boolean(passwordHash) && !passwordHash.startsWith("!");
}

export async function requestPasswordReset(input: {
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  origin?: string | null;
}): Promise<{
  accepted: true;
  mailed: boolean;
  mailError?: string;
  devResetUrl?: string;
}> {
  const db = await getDbAsync();
  const email = input.email.trim().toLowerCase();

  if (
    email === "louis@cyborggroup.com" ||
    email === (process.env.BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase()
  ) {
    try {
      await ensurePrimaryAdmin();
    } catch (e) {
      console.error("[password-reset] ensurePrimaryAdmin failed", e);
    }
  }

  const user = await db
    .prepare<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      is_active: number | boolean | string;
    }>(
      `SELECT id, organization_id, email, full_name, is_active
       FROM users WHERE lower(email) = lower(?) LIMIT 1`,
    )
    .get(email);

  // Always accept — do not reveal whether the account exists.
  if (!user || !isUserActive(user.is_active)) {
    return { accepted: true, mailed: false };
  }

  const token = newToken(32);
  const id = newId();
  const expires = new Date(
    Date.now() + RESET_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  await db
    .prepare(
      `INSERT INTO magic_links
       (id, user_id, organization_id, token_hash, purpose, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, 'password_reset', ?, ?, ?)`,
    )
    .run(
      id,
      user.id,
      user.organization_id,
      hashToken(token),
      expires,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    );

  const base = appBaseUrl(input.origin);
  const resetUrl = `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;

  const mail = await sendEmail({
    to: user.email,
    subject: "Reset your KINETIC password",
    text: `Hi ${user.full_name},\n\nSet a new password for KINETIC:\n${resetUrl}\n\nThis link expires in ${RESET_TTL_MINUTES} minutes. If you did not request it, ignore this email.`,
    html: `<p>Hi ${escapeHtml(user.full_name)},</p>
<p><a href="${resetUrl}">Set a new password</a></p>
<p>This link expires in ${RESET_TTL_MINUTES} minutes. If you did not request it, ignore this email.</p>`,
  });

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "auth.password_reset_requested",
    entityType: "user",
    entityId: user.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    after: { mailed: mail.ok, provider: mail.ok ? mail.provider : null },
  });

  if (!mail.ok) {
    console.warn("[password-reset] email send failed:", mail.error);
    console.info("[password-reset] URL for", user.email, resetUrl);
    return {
      accepted: true,
      mailed: false,
      mailError: mail.error,
      ...(process.env.NODE_ENV !== "production"
        ? { devResetUrl: resetUrl }
        : {}),
    };
  }

  if (mail.provider === "dev") {
    return { accepted: true, mailed: true, devResetUrl: resetUrl };
  }

  return { accepted: true, mailed: true };
}

export async function resetPasswordWithToken(input: {
  token: string;
  newPassword: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ user: AuthUser; sessionToken: string; csrfToken: string } | null> {
  const db = await getDbAsync();
  const token = input.token.trim();
  if (!token || token.length < 20) return null;

  const row = await db
    .prepare<{
      id: string;
      user_id: string;
      organization_id: string;
      purpose: string | null;
      expires_at: string;
      consumed_at: string | null;
    }>(
      `SELECT id, user_id, organization_id, purpose, expires_at, consumed_at
       FROM magic_links WHERE token_hash = ?`,
    )
    .get(hashToken(token));

  if (!row || row.consumed_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.purpose !== "password_reset") return null;

  const active = await db
    .prepare<{
      id: string;
      is_active: number | boolean | string;
    }>("SELECT id, is_active FROM users WHERE id = ?")
    .get(row.user_id);
  if (!active || !isUserActive(active.is_active)) return null;

  const hash = bcrypt.hashSync(input.newPassword, 12);

  await db
    .prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(hash, row.user_id, row.organization_id);

  await db
    .prepare(
      "UPDATE magic_links SET consumed_at = datetime('now') WHERE id = ?",
    )
    .run(row.id);

  await db
    .prepare(
      `UPDATE magic_links SET consumed_at = datetime('now')
       WHERE user_id = ? AND purpose = 'password_reset'
         AND consumed_at IS NULL AND id != ?`,
    )
    .run(row.user_id, row.id);

  await writeAudit({
    organizationId: row.organization_id,
    actorUserId: row.user_id,
    action: "auth.password_reset_completed",
    entityType: "user",
    entityId: row.user_id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return createSessionForUser({
    userId: row.user_id,
    organizationId: row.organization_id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    auditAction: "auth.password_reset_login",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
