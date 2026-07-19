import { json } from "@/lib/api";
import { getMailConfig, sendEmail } from "@/lib/mail";

/**
 * Non-secret mail diagnostics. Does not send unless ?probe=1&to=email.
 * Useful to confirm Coolify injected SENDGRID_API_KEY into the running container.
 */
export async function GET(req: Request) {
  const cfg = getMailConfig();
  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";
  const to = url.searchParams.get("to")?.trim().toLowerCase();

  const base = {
    keyConfigured: cfg.keyConfigured,
    keyLooksValid: cfg.keyLooksValid,
    keyPrefix: cfg.keyConfigured ? `${cfg.key.slice(0, 5)}…` : null,
    keyLength: cfg.key.length,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
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
