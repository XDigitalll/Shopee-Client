import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  BACKEND_ACCESS_COOKIE,
  BACKEND_REFRESH_COOKIE,
  buildProfileJson,
  cookieOpts,
  PROFILE_COOKIE,
  REFRESH_COOKIE_NAME,
  REFRESH_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value || cookieStore.get(BACKEND_REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ message: "Sem token de renovacao disponivel." }, { status: 401 });
  }

  const backendResponse = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  const payload = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok || !payload?.token || !payload?.refreshToken) {
    cookieStore.set(SESSION_COOKIE, "", cookieOpts(true, 0));
    cookieStore.set(REFRESH_COOKIE_NAME, "", cookieOpts(true, 0));
    cookieStore.set(BACKEND_ACCESS_COOKIE, "", cookieOpts(true, 0));
    cookieStore.set(BACKEND_REFRESH_COOKIE, "", cookieOpts(true, 0));
    cookieStore.set(PROFILE_COOKIE, "", cookieOpts(false, 0));
    return NextResponse.json(
      { message: (payload as { message?: string })?.message || "Nao foi possivel renovar a sessao." },
      { status: 401 }
    );
  }

  const newToken: string = payload.token;
  const newRefreshToken: string = payload.refreshToken;
  cookieStore.set(SESSION_COOKIE, newToken, cookieOpts(true, SESSION_MAX_AGE));
  cookieStore.set(REFRESH_COOKIE_NAME, newRefreshToken, cookieOpts(true, REFRESH_MAX_AGE));
  cookieStore.set(PROFILE_COOKIE, buildProfileJson(newToken), cookieOpts(false, SESSION_MAX_AGE));

  const nextResponse = NextResponse.json({ authenticated: true }, { status: 200 });
  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);
  return nextResponse;
}
