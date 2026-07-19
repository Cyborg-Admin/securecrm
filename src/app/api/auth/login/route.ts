import { NextRequest } from "next/server";
import { z } from "zod";
import { loginUser, SESSION_COOKIE, CSRF_COOKIE } from "@/lib/auth";
import { clientMeta, error, json } from "@/lib/api";
import { bootstrapApp } from "@/lib/bootstrap";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  bootstrapApp();
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

  if (!result) return error("Invalid email or password", 401);

  const res = json({
    user: {
      id: result.user.id,
      email: result.user.email,
      full_name: result.user.full_name,
      organization_id: result.user.organization_id,
      roles: result.user.roles,
      permissions: result.user.permissions,
    },
    csrfToken: result.csrfToken,
  });

  const maxAge = Number(process.env.SESSION_DAYS || 14) * 86400;
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  res.cookies.set(CSRF_COOKIE, result.csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return res;
}
