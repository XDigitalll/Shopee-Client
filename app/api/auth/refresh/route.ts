import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  BACKEND_REFRESH_COOKIE,
  clearClientAuthCookies,
  REFRESH_COOKIE_NAME,
  setClientAuthCookies,
} from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value || cookieStore.get(BACKEND_REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    const nextResponse = NextResponse.json({ message: "Sem token de renovacao disponivel." }, { status: 401 });
    nextResponse.headers.set("X-Shopee-Refresh-Cookie", "missing");
    clearClientAuthCookies(nextResponse);
    return nextResponse;
  }

  const backendResponse = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  const payload = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok || !payload?.token || !payload?.refreshToken) {
    const nextResponse = NextResponse.json(
      { message: (payload as { message?: string })?.message || "Nao foi possivel renovar a sessao." },
      { status: 401 }
    );
    nextResponse.headers.set("X-Shopee-Refresh-Cookie", "present-invalid");
    clearClientAuthCookies(nextResponse);
    return nextResponse;
  }

  const newToken: string = payload.token;
  const newRefreshToken: string = payload.refreshToken;

  const nextResponse = NextResponse.json({ authenticated: true }, { status: 200 });
  setClientAuthCookies(nextResponse, newToken, newRefreshToken);
  nextResponse.headers.set("X-Shopee-Refresh-Cookie", "present-rotated");
  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);
  return nextResponse;
}
