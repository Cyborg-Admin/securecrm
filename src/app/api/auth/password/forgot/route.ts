import { NextRequest } from "next/server";
import { z } from "zod";
import { clientMeta, error, json } from "@/lib/api";
import { bootstrapApp } from "@/lib/bootstrap";
import { requestPasswordReset } from "@/lib/password-reset";

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
    const result = await requestPasswordReset({
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
        ? "Password reset link sent. Check your inbox (and spam)."
        : "If that email is registered, a reset link is on its way. Check your inbox.",
      ...(result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Password reset failed";
    console.error("[auth.password.forgot]", message);
    return error(
      message.includes("SendGrid")
        ? message
        : "Could not send reset link. Check email configuration and try again.",
      503,
    );
  }
}
