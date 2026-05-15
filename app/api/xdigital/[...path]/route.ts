import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

async function forward(request: NextRequest, path: string[]) {
  const url = new URL(request.url);
  const backendUrl = new URL(`${BACKEND_URL}/${path.join("/")}`);

  backendUrl.search = url.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type") ?? "";

  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  if (cookieToken) {
    headers.set("Authorization", `Bearer ${cookieToken}`);
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  // Forward X-XSRF-TOKEN header from browser to Spring Boot
  const xsrfToken = request.headers.get(XSRF_HEADER.toLowerCase()) ??
    request.headers.get(XSRF_HEADER);
  if (xsrfToken) {
    headers.set(XSRF_HEADER, xsrfToken);
  }

  // Forward XSRF-TOKEN cookie from browser to Spring Boot
  const xsrfCookieValue = request.cookies.get(XSRF_COOKIE)?.value;
  if (xsrfCookieValue) {
    const existingCookie = headers.get("Cookie") ?? "";
    const xsrfCookiePair = `${XSRF_COOKIE}=${xsrfCookieValue}`;
    headers.set("Cookie", existingCookie ? `${existingCookie}; ${xsrfCookiePair}` : xsrfCookiePair);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (contentType.includes("multipart/form-data")) {
      init.body = await request.arrayBuffer();
    } else {
      init.body = await request.text();
    }
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(backendUrl, init);
  } catch (err) {
    console.error("[proxy] Backend unreachable:", backendUrl.toString(), err);
    return NextResponse.json(
      { message: "Nao conseguimos contactar o servidor. Tenta atualizar a pagina." },
      { status: 502 }
    );
  }

  if (process.env.NODE_ENV !== "production" && !backendResponse.ok) {
    console.warn("[proxy:xdigital]", {
      status: backendResponse.status,
      endpoint: `/${path.join("/")}`,
      method: request.method,
      hasAuthCookie: Boolean(cookieToken),
      hasXsrfHeader: Boolean(xsrfToken),
      hasXsrfCookie: Boolean(xsrfCookieValue),
    });
  }

  let text: string;
  try {
    text = await backendResponse.text();
  } catch (err) {
    console.error("[proxy] Failed to read backend response body:", err);
    return NextResponse.json(
      { message: "Erro ao ler resposta do servidor backend." },
      { status: 502 }
    );
  }

  const nextResponse = new NextResponse(text, {
    status: backendResponse.status,
    headers: {
      "Content-Type": backendResponse.headers.get("Content-Type") || "application/json",
    },
  });

  // Forward XSRF-TOKEN Set-Cookie from Spring Boot to the browser so JS can
  // read it and include it as X-XSRF-TOKEN on subsequent mutation requests.
  forwardNamedSetCookies(nextResponse, backendResponse.headers, [XSRF_COOKIE]);

  return nextResponse;
}

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}
