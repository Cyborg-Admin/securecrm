import { getDbAsync } from "@/lib/db";
import { newId, newToken } from "@/lib/ids";
import { hashToken, isUserActive, createSessionForUser } from "@/lib/auth";
import { appBaseUrl, sendEmail } from "@/lib/mail";
import { writeAudit } from "@/lib/audit";

const MAGIC_TTL_MINUTES = 20;

export async function requestMagicLink(input: {
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  origin?: string | null;
}): Promise<{
  accepted: true;
  mailed: boolean;
  mailError?: string;
  /** Only returned outside production when mail is not configured. */
  devMagicUrl?: string;
}> {
  const db = await getDbAsync();
  const email = input.email.trim().toLowerCase();
  const user = await db
    .prepare<{
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      is_active: number | boolean | string;
    }>(
      `SELECT id, organization_id, email, full_name, is_active
       FROM users WHERE lower(email) = ? LIMIT 1`,
    )
    .get(email);

  // Always accept — do not reveal whether the account exists.
  if (!user || !isUserActive(user.is_active)) {
    console.info("[magic-link] no active user for requested email");
    return { accepted: true, mailed: false };
  }

  console.info("[magic-link] issuing link for user", user.id);

  const token = newToken(32);
  const id = newId();
  const expires = new Date(
    Date.now() + MAGIC_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  await db
    .prepare(
      `INSERT INTO magic_links
       (id, user_id, organization_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
  const magicUrl = `${base}/auth/magic?token=${encodeURIComponent(token)}`;

  const mail = await sendEmail({
    to: user.email,
    subject: "Your SecureCRM sign-in link",
    text: `Hi ${user.full_name},\n\nSign in to SecureCRM:\n${magicUrl}\n\nThis link expires in ${MAGIC_TTL_MINUTES} minutes. If you did not request it, ignore this email.`,
    html: `<p>Hi ${escapeHtml(user.full_name)},</p>
<p><a href="${magicUrl}">Sign in to SecureCRM</a></p>
<p>This link expires in ${MAGIC_TTL_MINUTES} minutes. If you did not request it, ignore this email.</p>`,
  });

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "auth.magic_link_requested",
    entityType: "user",
    entityId: user.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    after: { mailed: mail.ok, provider: mail.ok ? mail.provider : null },
  });

  if (!mail.ok) {
    console.warn("[magic-link] email send failed:", mail.error);
    console.info("[magic-link] sign-in URL for", user.email, magicUrl);
    return {
      accepted: true,
      mailed: false,
      mailError: mail.error,
      ...(process.env.NODE_ENV !== "production"
        ? { devMagicUrl: magicUrl }
        : {}),
    };
  }

  if (mail.provider === "dev") {
    return { accepted: true, mailed: true, devMagicUrl: magicUrl };
  }

  return { accepted: true, mailed: true };
}

export async function consumeMagicLink(input: {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDbAsync();
  const token = input.token.trim();
  if (!token || token.length < 20) return null;

  const row = await db
    .prepare<{
      id: string;
      user_id: string;
      organization_id: string;
      expires_at: string;
      consumed_at: string | null;
    }>(
      `SELECT id, user_id, organization_id, expires_at, consumed_at
       FROM magic_links WHERE token_hash = ?`,
    )
    .get(hashToken(token));

  if (!row || row.consumed_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  await db
    .prepare(
      "UPDATE magic_links SET consumed_at = datetime('now') WHERE id = ?",
    )
    .run(row.id);

  // Invalidate sibling unused links for this user
  await db
    .prepare(
      `UPDATE magic_links SET consumed_at = datetime('now')
       WHERE user_id = ? AND consumed_at IS NULL AND id != ?`,
    )
    .run(row.user_id, row.id);

  return createSessionForUser({
    userId: row.user_id,
    organizationId: row.organization_id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    auditAction: "auth.magic_link_login",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
