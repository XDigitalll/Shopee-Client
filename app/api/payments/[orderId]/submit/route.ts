import { NextRequest, NextResponse } from "next/server";

import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";
import { getBackendUrl } from "@/lib/server/backend-url";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = getBackendUrl();

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

function jsonMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  return fallback;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { orderId } = await context.params;
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;

  if (!cookieToken) {
    return NextResponse.json(
      { message: "A tua sessao expirou. Entra novamente para enviar o comprovativo." },
      { status: 401 }
    );
  }

  const incoming = await request.formData();
  const outgoing = new FormData();
  for (const [key, value] of incoming.entries()) {
    outgoing.append(key, value);
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${cookieToken}`,
  });

  const xsrfToken = request.headers.get(XSRF_HEADER.toLowerCase()) ?? request.headers.get(XSRF_HEADER);
  if (xsrfToken) headers.set(XSRF_HEADER, xsrfToken);

  const xsrfCookieValue = request.cookies.get(XSRF_COOKIE)?.value;
  if (xsrfCookieValue) headers.set("Cookie", `${XSRF_COOKIE}=${xsrfCookieValue}`);

  const backendResponse = await fetch(`${BACKEND_URL}/api/payments/${encodeURIComponent(orderId)}/submit`, {
    method: "POST",
    headers,
    body: outgoing,
    cache: "no-store",
  });

  const payload = await backendResponse.json().catch(() => null);
  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: jsonMessage(payload, "Nao foi possivel enviar o comprovativo.") },
      { status: backendResponse.status }
    );
  }

  const response = NextResponse.json(payload ?? {}, { status: backendResponse.status });
  forwardNamedSetCookies(response, backendResponse.headers, [XSRF_COOKIE]);
  return response;
}
