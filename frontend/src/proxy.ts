import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];

// The backend lives on a different origin (cross-origin fetch + CORS, not a
// same-origin proxy path), so the CSP has to explicitly allow talking to it.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 'unsafe-inline' is required here: Next.js ships its hydration payload as
  // an inline <script>, and there's no nonce/hash plumbing in this app to
  // allow just that script without loosening the directive generally. Still
  // blocks loading a *remote* <script src="...">, which is the more common
  // XSS payload shape.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), camera=(), microphone=()",
  );
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  // Browsers ignore HSTS over plain http, so it's harmless for local/self-hosted http setups.
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=15552000");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );

  if (!token && !isPublicRoute) {
    // Marks this as a session-expiry redirect (as opposed to a plain
    // unauthenticated visit) so the login page can show the "session
    // expired" banner even when no client-side 401 ever fired — this path
    // runs server-side, before React mounts, so it can't touch sessionStorage.
    const url = new URL("/login", request.url);
    url.searchParams.set("session_expired", "1");
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if (token && isPublicRoute) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|icon-(?:192|512)\\.png$|paylark-logo\\.png$).*)",
  ],
};
