import { NextRequest } from "next/server";
import { logoutSession } from "@/lib/auth";
import { error, json } from "@/lib/api";

function extractToken(req: NextRequest): string | null {
  const header = req.headers.get("x-session-token")?.trim();
  if (header) return header;
  const auth = req.headers.get("authorization");
  const m = auth?.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();
  if (bearer && !bearer.startsWith("scrm_")) return bearer;
  return null;
}

/** Revoke the extension session token. */
export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return error("No session token", 400);
  await logoutSession(token);
  return json({ ok: true });
}
