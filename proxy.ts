import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/orders", "/checkout", "/profile", "/settings"];

const PUBLIC_EXCEPTIONS = [
  "/orders/external/new",
  "/profile/change-password",
];

function isProtected(pathname: string): boolean {
  if (
    pathname.startsWith("/complete-account") ||
    PUBLIC_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const session =
    request.cookies.get("shopee_client_session")?.value ||
    request.cookies.get("access_token")?.value;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/orders/:path*", "/checkout/:path*", "/profile/:path*", "/settings/:path*"],
};
