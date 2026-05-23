import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  if (record.messages && typeof record.messages === "object") {
    const firstValidationMessage = Object.values(record.messages as Record<string, unknown>).find(
      (value) => typeof value === "string" && value.trim()
    );

    if (typeof firstValidationMessage === "string") {
      return firstValidationMessage;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value || cookieStore.get(BACKEND_ACCESS_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });
  }

  const xsrfToken = cookieStore.get(XSRF_COOKIE)?.value;
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  if (xsrfToken) {
    headers.set(XSRF_HEADER, xsrfToken);
    headers.set("Cookie", `${XSRF_COOKIE}=${xsrfToken}`);
  }

  const backendResponse = await fetch(`${BACKEND_URL}/auth/complete-password`, {
    method: "POST",
    headers,
    body: await request.text(),
    cache: "no-store",
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { message: "Nao conseguimos contactar o servidor. Tenta atualizar a pagina." },
      { status: 502 }
    );
  }

  const payload = await backendResponse.json().catch(() => ({}));

  const nextResponse = NextResponse.json(
    backendResponse.ok
      ? payload
      : { message: getErrorMessage(payload) || "Nao foi possivel concluir a criacao da senha." },
    { status: backendResponse.status }
  );

  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);
  return nextResponse;
}
