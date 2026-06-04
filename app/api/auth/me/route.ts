import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  BACKEND_ACCESS_COOKIE,
  SESSION_COOKIE,
} from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";
import { getBackendUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendUrl();

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value || cookieStore.get(BACKEND_ACCESS_COOKIE)?.value;

  if (!token) {
    const nextResponse = NextResponse.json({ message: "Nao autenticado." }, { status: 401 });
    nextResponse.headers.set("X-Shopee-Session-Cookie", "missing");
    return nextResponse;
  }

  const backendResponse = await fetch(`${BACKEND_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!backendResponse || !backendResponse.ok) {
    const nextResponse = NextResponse.json(
      { message: "Sessao invalida ou expirada." },
      { status: 401 }
    );
    nextResponse.headers.set("X-Shopee-Session-Cookie", "present-invalid");
    return nextResponse;
  }

  const profile = await backendResponse.json().catch(() => null);
  const nextResponse = NextResponse.json(profile);
  nextResponse.headers.set("X-Shopee-Session-Cookie", "present-valid");
  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);
  return nextResponse;
}
