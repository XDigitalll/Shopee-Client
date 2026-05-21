import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildProfileJson,
  cookieOpts,
  PROFILE_COOKIE,
  REFRESH_COOKIE_NAME,
  REFRESH_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    token?: unknown;
    refreshToken?: unknown;
  } | null;

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";

  if (!token || !refreshToken) {
    return NextResponse.json(
      { message: "Sessão Google incompleta." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, cookieOpts(true, SESSION_MAX_AGE));
  cookieStore.set(REFRESH_COOKIE_NAME, refreshToken, cookieOpts(true, REFRESH_MAX_AGE));
  cookieStore.set(PROFILE_COOKIE, buildProfileJson(token), cookieOpts(false, SESSION_MAX_AGE));

  return NextResponse.json({ authenticated: true });
}
