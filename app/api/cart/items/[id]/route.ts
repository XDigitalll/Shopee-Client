import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type Context = { params: Promise<{ id: string }> };

function buildBackendHeaders(request: NextRequest, token?: string, contentType?: string) {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (token) headers.Authorization = `Bearer ${token}`;

  const xsrfToken = request.headers.get(XSRF_HEADER.toLowerCase()) ?? request.headers.get(XSRF_HEADER);
  const xsrfCookie = request.cookies.get(XSRF_COOKIE)?.value;
  if (xsrfToken) headers[XSRF_HEADER] = xsrfToken;
  if (xsrfCookie) headers.Cookie = `${XSRF_COOKIE}=${xsrfCookie}`;

  return headers;
}

async function proxyResponse(response: Response) {
  const text = await response.text();
  const nextResponse = new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
  const setCookieValues: string[] =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")!]
        : [];

  for (const value of setCookieValues) {
    if (value.startsWith(`${XSRF_COOKIE}=`)) {
      nextResponse.headers.append("Set-Cookie", value);
    }
  }
  return nextResponse;
}

export async function PUT(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  const body = await request.json();
  const response = await fetch(`${BACKEND_URL}/cart/update`, {
    method: "PUT",
    headers: buildBackendHeaders(request, token, "application/json"),
    body: JSON.stringify({ productId: Number(id), quantity: body.quantity }),
    cache: "no-store",
  });
  return proxyResponse(response);
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  const response = await fetch(`${BACKEND_URL}/cart/remove/${id}`, {
    method: "DELETE",
    headers: buildBackendHeaders(request, token),
    cache: "no-store",
  });
  return proxyResponse(response);
}
