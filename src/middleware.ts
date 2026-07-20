import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "scrm_session";

const PUBLIC_EXACT = new Set([
  "/login",
  "/auth/magic",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES = [
  "/_next/",
  "/api/auth/login",
  "/api/auth/magic",
  "/api/auth/mail-health",
  "/api/extension/",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p),
  );
}

function isProtectedAppPath(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (isPublicPath(pathname)) return false;
  // Root and all app pages require a session cookie before any UI is served.
  return true;
}

/** Auth gate + CORS for Chrome extension APIs. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Extension CORS preflight / headers
  if (pathname.startsWith("/api/extension")) {
    const origin = req.headers.get("origin") || "*";
    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      res.headers.set(k, v);
    }
    return res;
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = hasSession ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (isProtectedAppPath(pathname) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-Session-Token, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets that never need auth decisions.
     * Still includes pages so unauthenticated users never receive CRM HTML.
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
