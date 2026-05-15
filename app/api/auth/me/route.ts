import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, decodeJwtPayload, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value || cookieStore.get(BACKEND_ACCESS_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });
  }

  const backendResponse = await fetch(`${BACKEND_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!backendResponse || !backendResponse.ok) {
    // Fall back to JWT claims if backend is unreachable or token expired
    const payload = decodeJwtPayload(token);
    if (!payload) {
      return NextResponse.json({ message: "Sessao invalida." }, { status: 401 });
    }
    return NextResponse.json({
      name: payload.name,
      email: payload.email ?? payload.sub,
      avatarUrl: payload.avatarUrl,
      provider: payload.provider,
      roles: payload.roles,
      mustChangePassword: payload.mustChangePassword ?? false,
      expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : null,
    });
  }

  const profile = await backendResponse.json().catch(() => null);
  const nextResponse = NextResponse.json(profile);
  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);
  return nextResponse;
}
