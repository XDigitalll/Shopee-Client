import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "shopee_client_session";

const PROTECTED_PREFIXES = [
  "/profile",
  "/orders",
  "/checkout",
  "/notifications",
  "/delivery-address",
  "/settings",
];

// Public sub-paths that live inside a protected prefix
const PUBLIC_EXCEPTIONS = ["/orders/external/new"];

function isProtected(pathname: string): boolean {
  for (const exc of PUBLIC_EXCEPTIONS) {
    if (pathname === exc || pathname.startsWith(`${exc}/`)) return false;
  }
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
