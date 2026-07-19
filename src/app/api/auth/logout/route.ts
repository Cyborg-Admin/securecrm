import { NextRequest } from "next/server";
import { logoutSession, SESSION_COOKIE, CSRF_COOKIE } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await logoutSession(token);
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(CSRF_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
