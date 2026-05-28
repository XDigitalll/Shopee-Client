import { NextRequest, NextResponse } from "next/server";
import { rawOrderVisibleTotal } from "@/lib/order-money";
import { BACKEND_ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { getBackendUrl } from "@/lib/server/backend-url";

const BACKEND_URL = getBackendUrl();

function toAmount(order: Record<string, unknown>) {
  return rawOrderVisibleTotal(order);
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(BACKEND_ACCESS_COOKIE)?.value;
  const backendUrl = new URL(`${BACKEND_URL}/orders/me`);
  backendUrl.searchParams.set("page", "0");
  backendUrl.searchParams.set("size", "100");

  try {
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
    const orders = page.content || [];
    const delivered = orders.filter((order) => String(order.status || "") === "DELIVERED").length;
    const inProgress = orders.filter((order) => !["DELIVERED", "CANCELLED"].includes(String(order.status || ""))).length;
    const totalSpent = orders
      .filter((order) => String(order.status || "") !== "CANCELLED")
      .reduce((sum, order) => sum + toAmount(order), 0);

    return NextResponse.json({
      totalOrders: orders.length,
      inProgress,
      delivered,
      totalSpent,
    });
  } catch {
    return NextResponse.json(
      {
        message: "Nao foi possivel carregar as estatisticas dos pedidos. Confirma se o backend esta a correr na porta 8080.",
      },
      { status: 502 }
    );
  }
}
