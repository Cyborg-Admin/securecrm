import { json } from "@/lib/api";
import { bootstrapApp, ensurePrimaryAdmin } from "@/lib/bootstrap";
import { getDbAsync } from "@/lib/db";
import { getMailConfig, sendEmail } from "@/lib/mail";

/**
 * Non-secret mail diagnostics. Does not send unless ?probe=1&to=email.
 * Use ?ensure=1 to force primary admin provisioning.
 */
export async function GET(req: Request) {
  await bootstrapApp();
  const cfg = getMailConfig();
  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";
  const ensure = url.searchParams.get("ensure") === "1";
  const to = url.searchParams.get("to")?.trim().toLowerCase();

  const db = await getDbAsync();
  const userCount =
    (await db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM users").get())
      ?.c ?? 0;
  const louis = await db
    .prepare<{ id: string; is_active: number | boolean | string }>(
      `SELECT id, is_active FROM users
       WHERE lower(email) = lower(?) LIMIT 1`,
    )
    .get("louis@cyborggroup.com");

  let ensured: unknown = null;
  if (ensure) {
    ensured = await ensurePrimaryAdmin();
  }

  const base = {
    keyConfigured: cfg.keyConfigured,
    keyLooksValid: cfg.keyLooksValid,
    keyPrefix: cfg.keyConfigured ? `${cfg.key.slice(0, 5)}…` : null,
    keyLength: cfg.key.length,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    userCount: Number(userCount),
    louisExists: Boolean(louis),
    louisActive:
      louis != null &&
      (louis.is_active === true ||
        louis.is_active === 1 ||
        louis.is_active === "t" ||
        louis.is_active === "true"),
    ensured,
  };

  if (!probe || !to) {
    return json(base);
  }

  const result = await sendEmail({
    to,
    subject: "SecureCRM mail health probe",
    text: "If you received this, SendGrid delivery from SecureCRM is working.",
    html: "<p>If you received this, SendGrid delivery from SecureCRM is working.</p>",
  });

  return json({ ...base, probe: result });
}
