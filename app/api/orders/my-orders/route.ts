import { NextRequest, NextResponse } from "next/server";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { XSRF_COOKIE } from "@/lib/csrf";
import { forwardNamedSetCookies } from "@/lib/proxy-cookies";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

async function loadOrders(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  const url = new URL(request.url);
  const backendUrl = new URL(`${BACKEND_URL}/orders/me`);
  backendUrl.searchParams.set("page", "0");
  backendUrl.searchParams.set("size", "100");

  const response = await fetch(backendUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  }

  const page = await response.json() as { content?: Record<string, unknown>[] };
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");

  const orders = (page.content || []).filter((order) => {
    const typeMatch = !type || String(order.type || "") === type;
    const statusMatch = !status || String(order.status || "") === status;
    return typeMatch && statusMatch;
  });

  const nextResponse = NextResponse.json(orders);
  forwardNamedSetCookies(nextResponse, response.headers, [XSRF_COOKIE]);
  return nextResponse;
}

export async function GET(request: NextRequest) {
  try {
    return await loadOrders(request);
  } catch {
    return NextResponse.json(
      {
        message: "Nao conseguimos carregar os teus pedidos. Tenta atualizar a pagina.",
      },
      { status: 502 }
    );
  }
}
