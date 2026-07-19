type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; provider: "sendgrid" | "dev" }
  | { ok: false; error: string; status?: number };

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Parse `email@x.com` or `Name <email@x.com>`. */
export function parseFromAddress(raw: string): { email: string; name?: string } {
  const value = stripWrappingQuotes(raw);
  const angled = value.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (angled) {
    const name = angled[1].replace(/^["']|["']$/g, "").trim();
    return {
      email: angled[2].trim().toLowerCase(),
      ...(name ? { name } : {}),
    };
  }
  return { email: value.toLowerCase() };
}

export function getMailConfig() {
  const keyRaw = process.env.SENDGRID_API_KEY || "";
  const key = stripWrappingQuotes(keyRaw).replace(/^Bearer\s+/i, "");
  const fromRaw =
    process.env.MAIL_FROM ||
    process.env.SENDGRID_FROM ||
    "noreply@cyborgwales.com";
  const from = parseFromAddress(fromRaw);
  const fromName =
    process.env.MAIL_FROM_NAME?.trim() ||
    process.env.NEXT_PUBLIC_APP_NAME ||
    "SecureCRM";

  return {
    key,
    keyConfigured: Boolean(key),
    keyLooksValid: key.startsWith("SG."),
    fromEmail: from.email,
    fromName: from.name || fromName,
  };
}

/** Transactional email via SendGrid; falls back to server log in non-production. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = getMailConfig();

  if (!cfg.keyConfigured) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error: "Email is not configured (SENDGRID_API_KEY missing).",
      };
    }
    console.info("[mail:dev]", {
      from: cfg.fromEmail,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true, provider: "dev" };
  }

  if (!cfg.keyLooksValid) {
    return {
      ok: false,
      error:
        "SENDGRID_API_KEY looks corrupted (should start with SG.). In Coolify, set is_literal=true so $ characters are not expanded.",
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.fromEmail)) {
    return {
      ok: false,
      error: `MAIL_FROM is invalid after parsing: ${cfg.fromEmail}`,
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: cfg.fromEmail, name: cfg.fromName },
        subject: input.subject,
        content: [
          { type: "text/plain", value: input.text },
          { type: "text/html", value: input.html },
        ],
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: `SendGrid network error: ${message}` };
  }

  if (res.status === 202 || res.status === 200) {
    return { ok: true, provider: "sendgrid" };
  }

  const body = await res.text().catch(() => "");
  let detail = body.slice(0, 400);
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string; field?: string }>;
    };
    if (parsed.errors?.length) {
      detail = parsed.errors
        .map((err) => [err.field, err.message].filter(Boolean).join(": "))
        .join("; ");
    }
  } catch {
    /* keep raw body */
  }

  return {
    ok: false,
    status: res.status,
    error: `SendGrid ${res.status}: ${detail || res.statusText}`,
  };
}

export function appBaseUrl(reqOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  // Prefer configured public URL so magic links never point at an internal host.
  if (configured && !/sslip\.io|localhost|127\.0\.0\.1/i.test(configured)) {
    return configured;
  }
  if (configured) return configured;
  return reqOrigin?.replace(/\/$/, "") || "http://localhost:3000";
}
