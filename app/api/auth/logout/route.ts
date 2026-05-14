import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cookieOpts, PROFILE_COOKIE, REFRESH_COOKIE_NAME, SESSION_COOKIE } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const body = await request.text().catch(() => "");

  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;
    const accessToken = cookieStore.get(SESSION_COOKIE)?.value;

    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body || (refreshToken ? JSON.stringify({ refreshToken }) : "{}"),
      cache: "no-store",
    });
  } catch {
    // Best effort — always clear cookies even if backend is unreachable
  } finally {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, "", cookieOpts(true, 0));
    cookieStore.set(REFRESH_COOKIE_NAME, "", cookieOpts(true, 0));
    cookieStore.set(PROFILE_COOKIE, "", cookieOpts(false, 0));
  }

  return new NextResponse(null, { status: 204 });
}
