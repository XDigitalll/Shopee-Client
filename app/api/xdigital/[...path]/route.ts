import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";
import { getBackendUrl } from "@/lib/server/backend-url";
import { isAllowedXdigitalProxyPath } from "@/lib/server/xdigital-proxy-allowlist";

const BACKEND_URL = getBackendUrl();
const FORBIDDEN_MESSAGE = "Endpoint não permitido neste canal.";

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function summarizeFormData(form: FormData) {
  const entries: Array<Record<string, unknown>> = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") {
      const lower = name.toLowerCase();
      let safeValue = value;
      if (lower.includes("phone") || lower.includes("whatsapp")) {
        safeValue = value.replace(/\d(?=\d{3})/g, "*");
      } else if (lower.includes("url") || lower.includes("link")) {
        safeValue = value ? "[redacted-url]" : "";
      } else if (value.length > 120) {
        safeValue = `${value.slice(0, 120)}...`;
      }
      entries.push({ name, type: "field", value: safeValue });
      continue;
    }

    const file = value as File;
    entries.push({
      name,
      type: "file",
      filename: file.name,
      size: file.size,
      contentType: file.type,
    });
  }
  return entries;
}

async function forward(request: NextRequest, path: string[]) {
  const endpoint = `/${path.join("/")}`;
  if (!isAllowedXdigitalProxyPath(path, request.method)) {
    console.warn("[security:client-proxy-blocked]", {
      method: request.method,
      path: endpoint,
      ip: clientIp(request),
    });
    return NextResponse.json(
      { message: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const backendUrl = new URL(`${BACKEND_URL}/${path.join("/")}`);

  backendUrl.search = url.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type") ?? "";

  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  if (cookieToken) {
    headers.set("Authorization", `Bearer ${cookieToken}`);
  }

  if (contentType && !contentType.toLowerCase().includes("multipart/form-data")) {
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
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const incomingFormData = await request.formData();
      const outgoingFormData = new FormData();

      for (const [key, value] of incomingFormData.entries()) {
        outgoingFormData.append(key, value);
      }

      console.log("[proxy:xdigital:multipart:incoming]", [...incomingFormData.entries()]);
      console.log("[proxy:xdigital:multipart:outgoing]", [...outgoingFormData.entries()]);
      console.info("[proxy:xdigital:multipart:summary]", {
        endpoint,
        method: request.method,
        target: backendUrl.pathname,
        incoming: summarizeFormData(incomingFormData),
        outgoing: summarizeFormData(outgoingFormData),
      });

      const multipartHeaders = new Headers();
      multipartHeaders.set("Accept", "application/json");
      const authHeader = headers.get("Authorization");
      if (authHeader) {
        multipartHeaders.set("Authorization", authHeader);
      }
      const forwardedXsrfToken = headers.get(XSRF_HEADER);
      if (forwardedXsrfToken) {
        multipartHeaders.set(XSRF_HEADER, forwardedXsrfToken);
      }
      const forwardedCookie = headers.get("Cookie");
      if (forwardedCookie) {
        multipartHeaders.set("Cookie", forwardedCookie);
      }

      init.headers = multipartHeaders;
      init.body = outgoingFormData;
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
      endpoint,
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return forward(request, path);
}
