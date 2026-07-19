import { NextRequest, NextResponse } from "next/server";

/** CORS for Chrome extension calling the local CRM API. */
export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/extension")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin") || "*";
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  const res = NextResponse.next();
  const headers = corsHeaders(origin);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export const config = {
  matcher: ["/api/extension/:path*"],
};
