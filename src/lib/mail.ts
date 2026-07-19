type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; provider: "sendgrid" | "dev" }
  | { ok: false; error: string };

/** Transactional email via SendGrid; falls back to server log in non-production. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.SENDGRID_API_KEY?.trim();
  const from =
    process.env.MAIL_FROM?.trim() ||
    process.env.SENDGRID_FROM?.trim() ||
    "noreply@cyborgwales.com";

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error: "Email is not configured (SENDGRID_API_KEY missing).",
      };
    }
    console.info("[mail:dev]", {
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true, provider: "dev" };
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from, name: process.env.NEXT_PUBLIC_APP_NAME || "SecureCRM" },
      subject: input.subject,
      content: [
        { type: "text/plain", value: input.text },
        { type: "text/html", value: input.html },
      ],
    }),
  });

  if (res.status === 202 || res.status === 200) {
    return { ok: true, provider: "sendgrid" };
  }

  const body = await res.text().catch(() => "");
  return {
    ok: false,
    error: `SendGrid ${res.status}: ${body.slice(0, 200)}`,
  };
}

export function appBaseUrl(reqOrigin?: string | null): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    reqOrigin?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
