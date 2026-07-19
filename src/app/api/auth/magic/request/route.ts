import { NextRequest } from "next/server";
import { z } from "zod";
import { clientMeta, error, json } from "@/lib/api";
import { bootstrapApp } from "@/lib/bootstrap";
import { requestMagicLink } from "@/lib/magic-link";

const schema = z.object({
  email: z.string().email().max(320),
});

export async function POST(req: NextRequest) {
  try {
    await bootstrapApp();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON", 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return error("Enter a valid email address", 400);

    const meta = clientMeta(req);
    const result = await requestMagicLink({
      email: parsed.data.email,
      ...meta,
      origin: req.nextUrl.origin,
    });

    if (result.mailError) {
      return error(result.mailError, 503);
    }

    return json({
      ok: true,
      mailed: result.mailed,
      message: result.mailed
        ? "Sign-in link sent. Check your inbox (and spam)."
        : "If that email is registered, a sign-in link is on its way. Check your inbox.",
      ...(result.devMagicUrl ? { devMagicUrl: result.devMagicUrl } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Magic link failed";
    console.error("[auth.magic.request]", message);
    return error(
      message.includes("SendGrid") || message.includes("magic_links")
        ? message
        : "Could not send sign-in link. Check SENDGRID_API_KEY / MAIL_FROM and app logs.",
      503,
    );
  }
}
