import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  const response = await fetch(`${BACKEND_URL}/cart/me`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  const text = await response.text();
  const nextResponse = new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });

  const setCookieValues: string[] =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")!]
        : [];

  for (const value of setCookieValues) {
    if (value.startsWith(`${XSRF_COOKIE}=`)) {
      nextResponse.headers.append("Set-Cookie", value);
    }
  }

  return nextResponse;
}
