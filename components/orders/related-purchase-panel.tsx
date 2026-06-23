"use client";

import Link from "next/link";
import { orderDisplayCode } from "@/lib/order-label";
import type { Order } from "@/lib/types";

const RED = "#E8431A";
const GREEN = "#2E8B57";

function humanizePart(order: Order) {
  return order.type === "EXTERNAL" ? "Parte internacional" : "Parte local";
}

function customerStage(status: string) {
  const map: Record<string, string> = {
    CREATED: "Recebido",
    PENDING: "Recebido",
    UNDER_REVIEW: "Em analise",
    QUOTED: "Em analise",
    APPROVED: "Aguardando pagamento",
    PENDING_PAYMENT: "Aguardando pagamento",
    PAYMENT_SUBMITTED: "Pagamento submetido",
    PAYMENT_UNDER_REVIEW: "Pagamento em analise",
    PAYMENT_REJECTED: "Pagamento recusado",
    PAID: "Confirmado",
    CONFIRMED: "Confirmado",
    ORDERED: "Em processamento",
    PROCESSING: "Em processamento",
    SHIPPED: "Em transito",
    IN_TRANSIT: "Em transito",
    ARRIVED: "Na nossa sede",
    OUT_FOR_DELIVERY: "A caminho",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado",
  };

  return map[status] || "Recebido";
}

function resolveOrderHref(order: Order) {
  if (order.status === "DELIVERED") {
    return `/orders/${order.id}/receipt`;
  }

  return `/orders?highlight=${encodeURIComponent(String(order.id))}`;
}

export function RelatedPurchasePanel({
  currentOrder,
  relatedOrders,
}: {
  currentOrder: Order | null;
  relatedOrders: Order[];
}) {
  if (!currentOrder?.groupedPurchase || relatedOrders.length < 2) {
    return null;
  }

  return (
    <section className="rounded-[24px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>Compra composta</p>
          <h2 className="mt-2 text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
            Esta compra tem {relatedOrders.length} partes ligadas
          </h2>
          <p className="mt-2 text-sm leading-7" style={{ color: "#6B7280" }}>
            A parte local e a parte internacional nasceram no mesmo checkout. Podes navegar entre elas aqui sem perder o contexto.
          </p>
        </div>
        <div className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "#FFF8F5", color: RED }}>
          {currentOrder.type === "EXTERNAL" ? "Estas na parte internacional" : "Estas na parte local"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {relatedOrders.map((order) => {
          const isCurrent = order.id === currentOrder.id;
          return (
            <div key={order.id} className="rounded-[20px] border px-4 py-4" style={{ borderColor: isCurrent ? "#FDB8A7" : "#F2D4CC", background: isCurrent ? "#FFF8F5" : "#FFFDFC" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: order.type === "EXTERNAL" ? "#C2410C" : GREEN }}>
                    {humanizePart(order)}
                  </p>
                  <p className="mt-1 text-base font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
                    Pedido {orderDisplayCode(order)}
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "#FFF8F5", color: RED }}>
                  {customerStage(order.status)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {isCurrent ? (
                  <span className="rounded-2xl px-4 py-2 text-sm font-black text-white" style={{ background: RED }}>
                    Parte atual
                  </span>
                ) : (
                  <Link href={resolveOrderHref(order)} className="rounded-2xl border px-4 py-2 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
                    Abrir esta parte
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
