import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  BACKEND_ACCESS_COOKIE,
  BACKEND_REFRESH_COOKIE,
  clearClientAuthCookies,
  REFRESH_COOKIE_NAME,
  SESSION_COOKIE,
} from "@/lib/session";
import { getBackendUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendUrl();

export async function POST(request: NextRequest) {
  const body = await request.text().catch(() => "");

  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value || cookieStore.get(BACKEND_REFRESH_COOKIE)?.value;
    const accessToken = cookieStore.get(SESSION_COOKIE)?.value || cookieStore.get(BACKEND_ACCESS_COOKIE)?.value;

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
  }

  const nextResponse = new NextResponse(null, { status: 204 });
  clearClientAuthCookies(nextResponse);
  return nextResponse;
}
