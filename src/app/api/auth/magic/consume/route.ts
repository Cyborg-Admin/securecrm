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
import { consumeMagicLink } from "@/lib/magic-link";

const schema = z.object({
  token: z.string().min(20).max(500),
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
    if (!parsed.success) return error("Invalid or missing token", 400);

    const meta = clientMeta(req);
    const result = await consumeMagicLink({
      token: parsed.data.token,
      ...meta,
    });

    if (!result) {
      return error("This sign-in link is invalid or has expired.", 401);
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
    const message = e instanceof Error ? e.message : "Magic link failed";
    console.error("[auth.magic.consume]", message);
    return error("Could not complete sign-in.", 500);
  }
}
