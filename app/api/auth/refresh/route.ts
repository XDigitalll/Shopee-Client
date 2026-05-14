import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  buildProfileJson,
  cookieOpts,
  PROFILE_COOKIE,
  REFRESH_COOKIE_NAME,
  REFRESH_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  let refreshToken: string | undefined;

  // Prefer refresh token from body (localStorage flow); fall back to cookie (cookie-only flow)
  try {
    const body = (await request.json()) as { refreshToken?: string };
    if (body.refreshToken?.trim()) {
      refreshToken = body.refreshToken.trim();
    }
  } catch {
    // Body may be empty for cookie-only flow
  }

  if (!refreshToken) {
    refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;
  }

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
    cookieStore.set(PROFILE_COOKIE, "", cookieOpts(false, 0));
    return NextResponse.json(
      { message: (payload as { message?: string })?.message || "Nao foi possivel renovar a sessao." },
      { status: backendResponse.status }
    );
  }

  const newToken: string = payload.token;
  const newRefreshToken: string = payload.refreshToken;
  cookieStore.set(SESSION_COOKIE, newToken, cookieOpts(true, SESSION_MAX_AGE));
  cookieStore.set(REFRESH_COOKIE_NAME, newRefreshToken, cookieOpts(true, REFRESH_MAX_AGE));
  cookieStore.set(PROFILE_COOKIE, buildProfileJson(newToken), cookieOpts(false, SESSION_MAX_AGE));

  return NextResponse.json({ token: newToken, refreshToken: newRefreshToken }, { status: 200 });
}
