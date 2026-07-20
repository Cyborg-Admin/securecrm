import { NextRequest } from "next/server";
import { z } from "zod";
import { loginUser } from "@/lib/auth";
import { clientMeta, error, json } from "@/lib/api";
import { bootstrapApp } from "@/lib/bootstrap";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

/** Chrome extension login — returns session + CSRF tokens (no cookie reliance). */
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
    if (!parsed.success) return error("Invalid credentials payload", 400);

    const meta = clientMeta(req);
    const result = await loginUser({
      email: parsed.data.email,
      password: parsed.data.password,
      ...meta,
    });

    if (!result) {
      return error("Invalid email or password.", 401);
    }

    return json({
      sessionToken: result.sessionToken,
      csrfToken: result.csrfToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        organization_id: result.user.organization_id,
        roles: result.user.roles,
        permissions: result.user.permissions,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    console.error("[extension.auth.login]", message);
    return error("Sign-in failed. Please try again.", 500);
  }
}
