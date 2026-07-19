import { NextRequest, NextResponse } from "next/server";
import {
  assertPermission,
  getSessionUser,
  getUserFromApiKey,
  getUserFromSessionToken,
  verifyCsrf,
  type AuthUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import type { PermissionCode } from "@/lib/permissions";
import { bootstrapApp } from "@/lib/bootstrap";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function requireUser(
  req: NextRequest,
  permission?: PermissionCode,
): Promise<AuthUser | NextResponse> {
  await bootstrapApp();

  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  let user: AuthUser | null = null;
  if (apiKey?.startsWith("scrm_")) {
    user = await getUserFromApiKey(apiKey);
  } else {
    const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
    user = cookieToken
      ? await getUserFromSessionToken(cookieToken)
      : await getSessionUser();
  }

  if (!user) return error("Unauthorized", 401);

  if (permission) {
    try {
      assertPermission(user, permission);
    } catch {
      return error("Forbidden", 403, { permission });
    }
  }

  const method = req.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !apiKey?.startsWith("scrm_")) {
    const csrf =
      req.headers.get("x-csrf-token") ||
      req.headers.get("x-xsrf-token");
    if (!verifyCsrf(user, csrf)) {
      return error("Invalid CSRF token", 403);
    }
  }

  return user;
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export function clientMeta(req: NextRequest) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  };
}
