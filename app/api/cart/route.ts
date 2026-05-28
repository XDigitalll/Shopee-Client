import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";
import { getBackendUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendUrl();

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

  forwardNamedSetCookies(nextResponse, response.headers, [XSRF_COOKIE]);

  return nextResponse;
}
