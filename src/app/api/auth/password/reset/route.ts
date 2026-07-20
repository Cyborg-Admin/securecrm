import { NextRequest } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  sessionCookieOptions,
  csrfCookieOptions,
} from "@/lib/auth";
import { clientMeta, error, json } from "@/lib/api";
import { bootstrapApp } from "@/lib/bootstrap";
import { resetPasswordWithToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(20).max(500),
  newPassword: z.string().min(10).max(200),
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
    if (!parsed.success) {
      return error("Enter a valid reset token and a password (10+ characters).", 400);
    }

    const meta = clientMeta(req);
    const result = await resetPasswordWithToken({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
      ...meta,
    });

    if (!result) {
      return error("This reset link is invalid or has expired.", 401);
    }

    const res = json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        roles: result.user.roles,
      },
      csrfToken: result.csrfToken,
    });

    res.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions());
    res.cookies.set(CSRF_COOKIE, result.csrfToken, csrfCookieOptions());
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Password reset failed";
    console.error("[auth.password.reset]", message);
    return error("Could not reset password.", 500);
  }
}
