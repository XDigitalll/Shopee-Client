import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  const body = await request.text();
  const xsrfToken = request.headers.get(XSRF_HEADER) || request.headers.get(XSRF_HEADER.toLowerCase());
  const xsrfCookie = request.cookies.get(XSRF_COOKIE)?.value;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (xsrfToken) headers[XSRF_HEADER] = xsrfToken;
  if (xsrfCookie) headers.Cookie = `${XSRF_COOKIE}=${xsrfCookie}`;
  const response = await fetch(`${BACKEND_URL}/coupons/validate`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}
