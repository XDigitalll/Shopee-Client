import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

async function loadOrders(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const url = new URL(request.url);
  const backendUrl = new URL(`${BACKEND_URL}/orders/me`);
  backendUrl.searchParams.set("page", "0");
  backendUrl.searchParams.set("size", "100");

  const response = await fetch(backendUrl, {
    headers: authorization ? { Authorization: authorization } : undefined,
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

  return NextResponse.json(orders);
}

export async function GET(request: NextRequest) {
  try {
    return await loadOrders(request);
  } catch {
    return NextResponse.json(
      {
        message: "Nao foi possivel carregar os pedidos do cliente. Confirma se o backend esta a correr na porta 8080.",
      },
      { status: 502 }
    );
  }
}
