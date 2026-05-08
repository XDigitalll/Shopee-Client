"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientConfirmDialog, ClientFeedbackDock, ClientListLoadingOverlay, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { CLIENT_DATA_CHANGED_EVENT, apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import type { Order, OrderItem, OrderStats } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";

const RED = "#E8431A";
const GREEN = "#2E8B57";
const FILTERS = [
  { key: "ALL", label: "Todos" },
  { key: "EXTERNAL", label: "Externos" },
  { key: "INTERNAL", label: "Internos" },
  { key: "DELIVERED", label: "Entregues" },
] as const;
const FLOW_STEPS = ["Recebido", "Aguardando pagamento", "Confirmado", "Pronto", "A caminho", "Entregue"];
const FLOW_STEPS_EXTERNAL = ["Recebido", "Em analise", "Aguardando pagamento", "Confirmado", "Em processamento", "Em transito", "Na nossa sede", "A caminho", "Entregue"];
const DELIVERY_ISSUE_LABELS: Record<string, string> = {
  CLIENTE_AUSENTE: "Cliente ausente",
  ENDERECO_INCORRECTO: "Morada incorreta",
  PEDIDO_DANIFICADO: "Pedido danificado",
  IMPOSSIVEL_ENTREGAR: "Entrega impossivel",
};

type FilterKey = (typeof FILTERS)[number]["key"];
type OrderGroup = {
  key: string;
  purchaseGroupKey?: string;
  isComposite: boolean;
  orders: Order[];
};
type DeliveryFormState = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

function PackageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L11 4" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3.54 3.54a5 5 0 0 0 7.07 7.07L13 20" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15V6a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 6v9a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 15z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function effectiveOrderStatus(order: Pick<Order, "status" | "payment">) {
  return order.payment?.status === "FAILED" ? "FAILED" : order.status;
}

function customerStage(status: string) {
  const map: Record<string, "RECEIVED" | "PRICING" | "AWAITING_PAYMENT" | "CONFIRMED" | "PROCESSING" | "INTERNATIONAL_TRANSIT" | "AT_HQ" | "ON_THE_WAY" | "DELIVERED" | "CANCELLED"> = {
    CREATED: "RECEIVED",
    PENDING: "RECEIVED",
    UNDER_REVIEW: "PRICING",
    QUOTED: "PRICING",
    APPROVED: "AWAITING_PAYMENT",
    PENDING_PAYMENT: "AWAITING_PAYMENT",
    PAID: "CONFIRMED",
    CONFIRMED: "CONFIRMED",
    ORDERED: "PROCESSING",
    PROCESSING: "PROCESSING",
    SHIPPED: "INTERNATIONAL_TRANSIT",
    IN_TRANSIT: "INTERNATIONAL_TRANSIT",
    ARRIVED: "AT_HQ",
    OUT_FOR_DELIVERY: "ON_THE_WAY",
    DELIVERED: "DELIVERED",
    CANCELLED: "CANCELLED",
    FAILED: "CANCELLED",
  };

  return map[status] || "RECEIVED";
}

function statusMeta(status: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    RECEIVED: { label: "Recebido", bg: "#FFF7ED", color: "#C2410C" },
    PRICING: { label: "Em analise", bg: "#FEF3C7", color: "#92400E" },
    AWAITING_PAYMENT: { label: "Aguardando pagamento", bg: "#FFF7ED", color: "#9A3412" },
    CONFIRMED: { label: "Confirmado", bg: "#DCFCE7", color: "#166534" },
    PROCESSING: { label: "Em processamento", bg: "#E0F2FE", color: "#0369A1" },
    INTERNATIONAL_TRANSIT: { label: "Em transito", bg: "#DBEAFE", color: "#1D4ED8" },
    AT_HQ: { label: "Na nossa sede", bg: "#EDE9FE", color: "#5B21B6" },
    ON_THE_WAY: { label: "A caminho", bg: "#DBEAFE", color: "#1D4ED8" },
    DELIVERED: { label: "Entregue", bg: "#DCFCE7", color: "#166534" },
    CANCELLED: { label: "Cancelado", bg: "#FEE2E2", color: "#991B1B" },
    FAILED: { label: "Pagamento recusado", bg: "#FEE2E2", color: "#991B1B" },
  };

  return map[status] || map[customerStage(status)] || { label: status, bg: "#F3F4F6", color: "#4B5563" };
}

function stepIndexForStatus(status: string) {
  const map: Record<string, number> = {
    RECEIVED: 0,
    PRICING: 1,
    AWAITING_PAYMENT: 2,
    CONFIRMED: 3,
    PROCESSING: 4,
    INTERNATIONAL_TRANSIT: 5,
    AT_HQ: 6,
    ON_THE_WAY: 7,
    DELIVERED: 8,
    CANCELLED: 0,
    FAILED: 0,
  };

  return map[customerStage(status)] ?? 0;
}

function externalStepIndex(status: string) {
  return stepIndexForStatus(status);
}

function internalStepIndex(status: string) {
  const map: Record<string, number> = {
    CREATED: 0,
    PENDING: 0,
    APPROVED: 1,
    PENDING_PAYMENT: 1,
    PAID: 2,
    CONFIRMED: 2,
    ORDERED: 3,
    ARRIVED: 3,
    SHIPPED: 4,
    OUT_FOR_DELIVERY: 4,
    DELIVERED: 5,
    CANCELLED: 0,
    FAILED: 0,
  };

  return map[status] ?? 0;
}

function orderTotal(order: Order) {
  return orderVisibleTotal(order);
}

function itemChips(order: Order) {
  if (order.items?.length) {
    return order.items.slice(0, 4).map((item: OrderItem, index) => ({
      key: `${item.productId || item.productName || index}`,
      label: `${item.productCode ? `${item.productCode} · ` : ""}${item.productName || "Item"}${item.quantity > 1 ? ` x${item.quantity}` : ""}`,
    }));
  }

  const fallback = [order.sourceStore, order.deliveryMethod === "STORE_PICKUP" ? "Levantamento na loja" : "Entrega ao domicilio", order.payOnDelivery ? "Paga ao receber" : null, order.deliveryCity]
    .filter(Boolean)
    .slice(0, 4);

  return fallback.map((label, index) => ({ key: `${label}-${index}`, label: String(label) }));
}

function buildDeliveryAddress(order: Order) {
  return [
    order.deliveryStreet,
    order.houseNumber,
    order.deliveryNeighborhood,
    order.deliveryCity,
    order.deliveryReference,
  ].filter(Boolean).join(", ");
}

function hasDeliveryAddress(order: Order) {
  return Boolean(
    order.deliveryCity?.trim() &&
    order.deliveryNeighborhood?.trim() &&
    order.deliveryStreet?.trim() &&
    order.deliveryReference?.trim()
  );
}

function buildDeliveryAddressFormUrl(order: Order) {
  const code = order.code || String(order.id);
  const params = new URLSearchParams();
  if (order.primaryPhoneNumber) {
    params.set("phone", order.primaryPhoneNumber);
  }
  const query = params.toString();
  return `/delivery-address/${encodeURIComponent(code)}${query ? `?${query}` : ""}`;
}

function buildPhoneHref(phone: string | null | undefined) {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed.replace(/\s/g, "")}` : null;
}

function buildInitialDeliveryForm(order: Order): DeliveryFormState {
  return {
    name: order.customerFullName || "",
    phone: order.primaryPhoneNumber || "",
    address: buildDeliveryAddress(order),
    notes: order.customerNotes || "",
  };
}

function canScheduleDelivery(order: Order) {
  return order.status === "ARRIVED" && order.deliveryMethod !== "STORE_PICKUP" && Number(order.deliveryFee || 0) > 0;
}

function deliveryIssueLabel(order: Order) {
  const type = String(order.lastIssueType || "").toUpperCase();
  return DELIVERY_ISSUE_LABELS[type] ?? (type || "Incidente na entrega");
}

function sortOrdersForDisplay(orders: Order[]) {
  return [...orders].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "INTERNAL" ? -1 : 1;
    }

    return new Date(right.orderDate || 0).getTime() - new Date(left.orderDate || 0).getTime();
  });
}

function buildOrderGroups(orders: Order[], filter: FilterKey): OrderGroup[] {
  if (filter !== "ALL") {
    return orders.map((order) => ({ key: `order-${order.id}`, isComposite: false, orders: [order] }));
  }

  const groups: OrderGroup[] = [];
  const seen = new Set<string>();

  orders.forEach((order) => {
    const purchaseGroupKey = order.purchaseGroupKey;
    const isComposite = Boolean(purchaseGroupKey && (order.purchaseGroupSize || 0) > 1);

    if (!isComposite || !purchaseGroupKey) {
      groups.push({ key: `order-${order.id}`, isComposite: false, orders: [order] });
      return;
    }

    if (seen.has(purchaseGroupKey)) {
      return;
    }

    seen.add(purchaseGroupKey);
    groups.push({
      key: purchaseGroupKey,
      purchaseGroupKey,
      isComposite: true,
      orders: sortOrdersForDisplay(orders.filter((candidate) => candidate.purchaseGroupKey === purchaseGroupKey)),
    });
  });

  return groups;
}

function describeCompositeGroup(orders: Order[]) {
  const localCount = orders.filter((order) => order.type === "INTERNAL").length;
  const externalCount = orders.filter((order) => order.type === "EXTERNAL").length;
  const parts: string[] = [];

  if (localCount) {
    parts.push(localCount === 1 ? "1 pedido local" : `${localCount} pedidos locais`);
  }

  if (externalCount) {
    parts.push(externalCount === 1 ? "1 compra internacional" : `${externalCount} compras internacionais`);
  }

  return parts.join(" e ");
}

function compositeStageMeta(orders: Order[]) {
  const orderedStages = ["CANCELLED", "RECEIVED", "PRICING", "AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "ON_THE_WAY", "DELIVERED"] as const;
  const stages = orders.map((order) => customerStage(effectiveOrderStatus(order)));
  const resolved = orderedStages.find((stage) => stages.includes(stage)) || "RECEIVED";
  return statusMeta(resolved);
}

function compositeHeadline(orders: Order[]) {
  if (orders.some((order) => effectiveOrderStatus(order) === "FAILED")) {
    return "Um pagamento desta compra foi recusado. Acompanha a mensagem da ShopeeX para saber o motivo.";
  }

  if (orders.some((order) => customerStage(effectiveOrderStatus(order)) === "PRICING")) {
    return "A parte internacional segue em proposta enquanto a compra local continua normalmente.";
  }

  if (orders.some((order) => customerStage(effectiveOrderStatus(order)) === "AWAITING_PAYMENT")) {
    return "Ainda existe uma parte desta compra a aguardar pagamento para avancar.";
  }

  return "Esta compra foi dividida automaticamente para manter a entrega local e a compra internacional bem organizadas.";
}

async function fetchWithToken<T>(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Nao foi possivel carregar os pedidos.");
  return payload as T;
}

export default function OrdersPage() {
  const { token, userInitials, userLabel } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({ totalOrders: 0, inProgress: 0, delivered: 0, totalSpent: 0 });
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: "cancel" | "received"; orderId: number } | null>(null);
  const [deliveryFormOrderId, setDeliveryFormOrderId] = useState<number | null>(null);
  const [deliveryForms, setDeliveryForms] = useState<Record<number, DeliveryFormState>>({});

  const loadOrders = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!token) return;
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const [ordersData, statsData] = await Promise.all([
        fetchWithToken<Order[]>("/api/orders/my-orders", token),
        fetchWithToken<OrderStats>("/api/orders/my-stats", token),
      ]);
      setOrders(ordersData);
      setStats(statsData);
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel carregar os pedidos." });
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const refresh = () => {
      void loadOrders({ silent: true });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadOrders({ silent: true });
      }
    };

    const intervalId = window.setInterval(refresh, 8000);
    window.addEventListener("focus", refresh);
    window.addEventListener(CLIENT_DATA_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CLIENT_DATA_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadOrders, token]);

  const filteredOrders = useMemo(() => {
    if (filter === "EXTERNAL") return orders.filter((order) => order.type === "EXTERNAL");
    if (filter === "INTERNAL") return orders.filter((order) => order.type === "INTERNAL");
    if (filter === "DELIVERED") return orders.filter((order) => order.status === "DELIVERED");
    return orders;
  }, [filter, orders]);

  const orderGroups = useMemo(() => buildOrderGroups(filteredOrders, filter), [filter, filteredOrders]);

  const showAddressBanner = useMemo(
    () => !isLoading && orders.some(
      (o) => o.status === "ARRIVED" && o.deliveryMethod !== "STORE_PICKUP" && !hasDeliveryAddress(o)
    ),
    [isLoading, orders]
  );

  const openDeliveryForm = (order: Order) => {
    setDeliveryForms((current) => ({
      ...current,
      [order.id]: current[order.id] ?? buildInitialDeliveryForm(order),
    }));
    setDeliveryFormOrderId((current) => (current === order.id ? null : order.id));
  };

  const updateDeliveryForm = (orderId: number, patch: Partial<DeliveryFormState>) => {
    setDeliveryForms((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] ?? { name: "", phone: "", address: "", notes: "" }),
        ...patch,
      },
    }));
  };

  const submitDeliveryForm = (order: Order) => {
    const form = deliveryForms[order.id] ?? buildInitialDeliveryForm(order);
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
      setFeedback({ type: "error", msg: "Preenche nome, celular e morada para a entrega." });
      return;
    }

    setDeliveryFormOrderId(null);
    setFeedback({
      type: "success",
      msg: `Pedido ${orderDisplayCode(order)} pronto para contacto de entrega. A equipa vai usar estes dados para combinar contigo.`,
    });
  };

  const handleCancel = async (orderId: number) => {
    if (!token) return;
    const orderLabel = orderDisplayCode(orders.find((order) => order.id === orderId));
    setBusyOrderId(orderId);
    try {
      await apiFetch(`orders/${orderId}/cancel`, { method: "PUT", token });
      setFeedback({ type: "success", msg: `Pedido ${orderLabel} recusado com sucesso.` });
      await loadOrders();
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel recusar o pedido." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleConfirmReceived = async (orderId: number) => {
    if (!token) return;
    const orderLabel = orderDisplayCode(orders.find((order) => order.id === orderId));
    setBusyOrderId(orderId);
    try {
      await apiFetch(`orders/${orderId}/confirm-received`, { method: "PUT", token });
      setFeedback({ type: "success", msg: `Pedido ${orderLabel} confirmado como recebido.` });
      await loadOrders();
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel confirmar o recebimento." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const statsCards = [
    { label: "Total de pedidos", value: stats.totalOrders, accent: RED },
    { label: "Em andamento", value: stats.inProgress, accent: "#92400E" },
    { label: "Entregues", value: stats.delivered, accent: GREEN },
  ];

  const renderOrderCard = (order: Order, options?: { nested?: boolean }) => {
    const isExternal = order.type === "EXTERNAL";
    const status = effectiveOrderStatus(order);
    const isNested = options?.nested;
    const chips = itemChips(order);
    const meta = (isExternal && status === "ARRIVED")
      ? { label: "Na nossa sede", bg: "#EDE9FE", color: "#5B21B6" }
      : statusMeta(status);
    const flowSteps = isExternal ? FLOW_STEPS_EXTERNAL : FLOW_STEPS;
    const stepIndex = isExternal ? externalStepIndex(status) : internalStepIndex(status);
    const showDeliveryForm = deliveryFormOrderId === order.id;
    const deliveryForm = deliveryForms[order.id] ?? buildInitialDeliveryForm(order);
    const deliveryFee = Number(order.deliveryFee || 0);

    return (
      <article
        key={order.id}
        className={`rounded-[28px] border bg-white p-5 ${isNested ? "shadow-none" : "shadow-sm"}`}
        style={{ borderColor: isNested ? "#F6CFC2" : "#F2D4CC" }}
      >
        {isNested && (
          <div className="mb-3 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em]" style={{ background: "#FFF8F5", color: RED }}>
            {isExternal ? "Parte internacional" : "Parte local"}
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: isExternal ? "#FFF7ED" : "#ECFDF5", color: isExternal ? "#C2410C" : GREEN }}>
              {isExternal ? <LinkIcon /> : <PackageIcon />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Pedido {orderDisplayCode(order)}</h2>
                <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ background: isExternal ? "#FFF7ED" : "#ECFDF5", color: isExternal ? "#C2410C" : GREEN }}>
                  {isExternal ? "EXT" : "INT"}
                </span>
                {order.sourceStore && <span className="rounded-full bg-[#FFF8F5] px-2.5 py-1 text-xs font-semibold" style={{ color: RED }}>{order.sourceStore}</span>}
              </div>
              <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>{formatDate(order.orderDate)}</p>
            </div>
          </div>

          <span className="self-start rounded-full px-3 py-1.5 text-xs font-black" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip.key} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "#FFF8F5", color: "#6B7280" }}>{chip.label}</span>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto pb-2">
          <div className={`flex items-center ${isExternal ? "min-w-[900px]" : "min-w-[760px]"}`}>
            {flowSteps.map((step, index) => {
              const isDelivered = status === "DELIVERED";
              const done = isDelivered ? true : index < stepIndex;
              const current = !isDelivered && index === stepIndex;
              return (
                <div key={step} className="flex min-w-[84px] flex-1 items-center">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-4 w-4 rounded-full border-2" style={{ background: done ? RED : current ? "white" : "transparent", borderColor: RED }} />
                    <span className="mt-2 text-[11px] font-semibold" style={{ color: current || done ? RED : "#9CA3AF" }}>{step}</span>
                  </div>
                  {index < flowSteps.length - 1 && <div className="mx-2 h-[2px] flex-1" style={{ background: done ? RED : "#F2D4CC" }} />}
                </div>
              );
            })}
          </div>
        </div>

        {isExternal && status === "QUOTED" && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#FFF7ED", borderColor: "#FDBA74" }}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-base">✅</span>
              <div>
                <h3 className="text-base font-black" style={{ color: "#9A3412", fontFamily: "'Sora', sans-serif" }}>Cotacao pronta!</h3>
                <p className="mt-1 text-sm" style={{ color: "#9A3412" }}>Ja temos o preco final da tua compra. Revê a proposta e decide se queres continuar.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/orders/${order.id}/quote`} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>Ver proposta</Link>
              <button type="button" onClick={() => setConfirmAction({ kind: "cancel", orderId: order.id })} disabled={busyOrderId === order.id} className="rounded-2xl px-4 py-2.5 text-sm font-bold" style={{ background: "#FCEBEB", color: "#B42318" }}>
                {busyOrderId === order.id ? "A recusar..." : "Recusar"}
              </button>
            </div>
            {order.code && (
              <p className="mt-3 text-xs" style={{ color: "#92400E" }}>
                <span className="font-bold">Tens o Telegram?</span>{" "}
                Responde com <span className="rounded px-1 font-mono font-bold" style={{ background: "rgba(146,64,14,0.1)" }}>SIM {order.code}</span> para aceitar ou{" "}
                <span className="rounded px-1 font-mono font-bold" style={{ background: "rgba(146,64,14,0.1)" }}>NAO {order.code}</span> para recusar diretamente no chat.
              </p>
            )}
          </div>
        )}

        {status === "ARRIVED" && (isExternal || order.lastIssueType) && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F5F3FF", borderColor: "#DDD6FE" }}>
            {order.lastIssueType ? (
              <>
                <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>Tentativa de entrega nao concluida</h3>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  Motivo: {deliveryIssueLabel(order)}. A encomenda voltou para a nossa sede e a equipa vai preparar uma nova tentativa.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>A tua encomenda chegou a Maputo!</h3>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  {hasDeliveryAddress(order)
                    ? "O teu produto ja esta na nossa sede. A equipa vai preparar a entrega com os dados que ja temos."
                    : "O teu produto ja esta na nossa sede. Confirma a tua morada para a equipa combinar a entrega ao domicilio."}
                </p>
              </>
            )}
            {!order.lastIssueType && !hasDeliveryAddress(order) ? (
              <Link
                href={buildDeliveryAddressFormUrl(order)}
                className="mt-4 inline-flex rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: RED }}
              >
                Informar morada
              </Link>
            ) : null}
          </div>
        )}

        {canScheduleDelivery(order) && showDeliveryForm ? (
          <section className="mt-4 rounded-[24px] border p-4" style={{ background: "#FFFDFC", borderColor: "#F2D4CC" }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>Delivery</p>
                <h3 className="mt-1 text-lg font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
                  Confirmar dados de entrega
                </h3>
              </div>
              <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "#FFF8F5" }}>
                <span style={{ color: "#6B7280" }}>Delivery </span>
                <strong style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(deliveryFee)}</strong>
                <span style={{ color: "#6B7280" }}> · Total </span>
                <strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(orderTotal(order))}</strong>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold" style={{ color: "#6B7280" }}>Nome</span>
                <input
                  value={deliveryForm.name}
                  onChange={(event) => updateDeliveryForm(order.id, { name: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold" style={{ color: "#6B7280" }}>Celular</span>
                <input
                  value={deliveryForm.phone}
                  onChange={(event) => updateDeliveryForm(order.id, { phone: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}
                  placeholder="+258"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-semibold" style={{ color: "#6B7280" }}>Morada</span>
                <textarea
                  value={deliveryForm.address}
                  onChange={(event) => updateDeliveryForm(order.id, { address: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#F2D4CC", background: "#FFFDFC", minHeight: 86 }}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-semibold" style={{ color: "#6B7280" }}>Notas para o estafeta</span>
                <textarea
                  value={deliveryForm.notes}
                  onChange={(event) => updateDeliveryForm(order.id, { notes: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#F2D4CC", background: "#FFFDFC", minHeight: 78 }}
                  placeholder="Horario preferido, ponto de referencia ou instrucao especial."
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => submitDeliveryForm(order)}
                className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: RED }}
              >
                Confirmar dados de delivery
              </button>
              <button
                type="button"
                onClick={() => setDeliveryFormOrderId(null)}
                className="rounded-2xl border px-4 py-2.5 text-sm font-bold"
                style={{ borderColor: "#F2D4CC", color: "#6B7280" }}
              >
                Cancelar
              </button>
            </div>
          </section>
        ) : null}

        {isExternal && status === "OUT_FOR_DELIVERY" && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
            <h3 className="text-base font-black" style={{ color: "#1D4ED8", fontFamily: "'Sora', sans-serif" }}>A tua entrega ja saiu da nossa sede!</h3>
            <p className="mt-1 text-sm" style={{ color: "#1D4ED8" }}>A equipa de delivery esta a caminho da tua morada com a tua encomenda.</p>
            {(order.assignedDriverName || order.assignedDriverPhone) && (
              <div className="mt-4 flex flex-col gap-3 rounded-[20px] bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "#1D4ED8" }}>Estafeta</p>
                  <p className="mt-1 text-sm font-black" style={{ color: "#111827", fontFamily: "'Sora', sans-serif" }}>
                    {order.assignedDriverName || "Estafeta atribuido"}
                  </p>
                  {order.assignedDriverPhone ? (
                    <a href={buildPhoneHref(order.assignedDriverPhone) ?? undefined} className="mt-1 inline-flex text-sm font-bold hover:underline" style={{ color: RED }}>
                      {order.assignedDriverPhone}
                    </a>
                  ) : null}
                </div>
                {order.assignedDriverPhone ? (
                  <a
                    href={buildPhoneHref(order.assignedDriverPhone) ?? undefined}
                    className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                    style={{ background: RED }}
                  >
                    Ligar para o estafeta
                  </a>
                ) : null}
              </div>
            )}
          </div>
        )}

        {order.adminMessageForClient && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#EFF6FF", borderColor: "#93C5FD" }}>
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "#1D4ED8" }}>Mensagem da ShopeeX</p>
            <p className="mt-2 text-sm" style={{ color: "#1D4ED8", whiteSpace: "pre-wrap" }}>{order.adminMessageForClient}</p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "#F2D4CC" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{status === "DELIVERED" ? "Total pago" : "Valor do pedido"}</p>
            <p className="mt-1 text-2xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(orderTotal(order))}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {status === "PENDING_PAYMENT" && !order.payOnDelivery && <Link href={`/orders/${order.id}/payment`} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>Pagar agora</Link>}
            {status === "SHIPPED" && <a href={order.googleMapsLink || order.externalCartUrl || "#"} target="_blank" rel="noreferrer" className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#D8B4FE", color: "#6B21A8" }}>Rastrear envio</a>}
            {(status === "OUT_FOR_DELIVERY" || (status === "ARRIVED" && order.deliveryMethod === "STORE_PICKUP")) && (
              <button
                type="button"
                onClick={() => setConfirmAction({ kind: "received", orderId: order.id })}
                disabled={busyOrderId === order.id}
                className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: busyOrderId === order.id ? "#FDB8A7" : RED }}
              >
                {busyOrderId === order.id ? "A confirmar..." : "Confirmar recebido"}
              </button>
            )}
            {status === "DELIVERED" && <Link href={`/orders/${order.id}/receipt`} className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>Ver recibo</Link>}
            {status === "DELIVERED" && <Link href="/store" className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>Repetir pedido</Link>}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Painel do cliente</p>
            <h1 className="mt-1 text-3xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Meus pedidos</h1>
            <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>Ola, {userLabel}. Acompanha aqui o estado simples de cada compra.</p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-full border px-3 py-2" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: RED, fontFamily: "'Sora', sans-serif" }}>{userInitials}</div>
            <div>
              <p className="text-xs" style={{ color: "#9CA3AF" }}>Cliente autenticado</p>
              <p className="text-sm font-bold" style={{ color: "#1A1410" }}>{userLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {statsCards.map((card) => (
          <article key={card.label} className="rounded-[26px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <p className="text-sm" style={{ color: "#6B7280" }}>{card.label}</p>
            <p className="mt-3 text-3xl font-black" style={{ color: card.accent, fontFamily: "'Sora', sans-serif" }}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className="rounded-full px-4 py-2 text-sm font-bold transition"
              style={{ background: active ? RED : "white", color: active ? "white" : "#6B7280", border: `1px solid ${active ? RED : "#F2D4CC"}` }}
            >
              {item.label}
            </button>
          );
        })}
      </section>

      {showAddressBanner && (
        <section className="rounded-[28px] border p-5 shadow-sm" style={{ borderColor: "#BAE6FD", background: "#F0F9FF" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "#BAE6FD", color: "#0369A1" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black" style={{ color: "#0369A1" }}>Tens um pedido pronto para entrega</p>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#E0F2FE", color: "#0369A1" }}>
                    Recomendado
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "#0C4A6E" }}>
                  Adiciona uma morada de entrega ao teu perfil para a equipa poder contactar-te e entregar mais depressa.
                </p>
              </div>
            </div>
            <Link
              href="/profile"
              className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
              style={{ background: "#0284C7" }}
            >
              Adicionar morada
            </Link>
          </div>
        </section>
      )}

      <section className="relative space-y-4" aria-busy={isLoading}>
        {isLoading && !orderGroups.length ? (
          <ClientSectionSkeleton
            title="A carregar pedidos"
            message="Estamos a sincronizar estados, pagamentos e entregas do teu historico."
            rows={3}
          />
        ) : orderGroups.length === 0 ? (
          <div className="rounded-[28px] border-2 border-dashed bg-white px-6 py-16 text-center" style={{ borderColor: "#F2D4CC" }}>
            <div className="mx-auto flex w-fit items-center justify-center rounded-full bg-[#FFF8F5] p-4"><EmptyIcon /></div>
            <h2 className="mt-4 text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Nenhum pedido encontrado</h2>
            <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>Troca o filtro acima ou inicia uma nova compra internacional.</p>
          </div>
        ) : (
          orderGroups.map((group) => {
            if (!group.isComposite) {
              return renderOrderCard(group.orders[0]);
            }

            const total = group.orders.reduce((sum, order) => sum + orderTotal(order), 0);
            const meta = compositeStageMeta(group.orders);
            const referenceDate = group.orders[0]?.orderDate;

            return (
              <section key={group.key} className="rounded-[32px] border p-3 shadow-sm" style={{ borderColor: "#F6CFC2", background: "#FFF8F5" }}>
                <div className="flex flex-col gap-4 rounded-[26px] border bg-white px-5 py-5" style={{ borderColor: "#F6CFC2" }}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>Compra composta</p>
                      <h2 className="mt-2 text-2xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Uma compra, {group.orders.length} partes sincronizadas</h2>
                      <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>{describeCompositeGroup(group.orders)}. {compositeHeadline(group.orders)}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                      <span className="self-start rounded-full px-3 py-1.5 text-xs font-black sm:self-auto" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Total combinado</p>
                      <p className="text-2xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(total)}</p>
                      {referenceDate && <p className="text-sm" style={{ color: "#6B7280" }}>{formatDate(referenceDate)}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {group.orders.map((order) => (
                      <span key={order.id} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: order.type === "EXTERNAL" ? "#FFF7ED" : "#ECFDF5", color: order.type === "EXTERNAL" ? "#C2410C" : GREEN }}>
                        {order.type === "EXTERNAL" ? `Internacional ${orderDisplayCode(order)}` : `Local ${orderDisplayCode(order)}`}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  {group.orders.map((order) => renderOrderCard(order, { nested: true }))}
                </div>
              </section>
            );
          })
        )}

        <Link href="/orders/external/new" className="block rounded-[28px] border-2 border-dashed bg-white p-6 transition hover:border-[#E8431A]" style={{ borderColor: "#F2D4CC" }}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "#FFF7ED", color: RED }}><LinkIcon /></div>
            <div>
              <h3 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Comprar do estrangeiro</h3>
              <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Partilha um link da Shein, Temu, Amazon ou outra loja internacional e acompanha tudo no mesmo painel.</p>
            </div>
          </div>
        </Link>
        <ClientListLoadingOverlay
          visible={isLoading && orderGroups.length > 0}
          title="A carregar pedidos"
          message="Estamos a atualizar a tua lista de pedidos."
        />
      </section>
      <ClientFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />
      <ClientConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.kind === "cancel" ? "Recusar esta proposta?" : "Confirmar recebimento?"}
        message={
          confirmAction?.kind === "cancel"
            ? `O pedido ${orderDisplayCode(orders.find((order) => order.id === confirmAction.orderId))} sera marcado como recusado e a equipa sera informada.`
            : `Vamos marcar o pedido ${orderDisplayCode(orders.find((order) => order.id === confirmAction?.orderId))} como recebido para fechar esta etapa.`
        }
        confirmLabel={confirmAction?.kind === "cancel" ? "Recusar pedido" : "Confirmar recebido"}
        danger={confirmAction?.kind === "cancel"}
        pending={busyOrderId === confirmAction?.orderId}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          const action =
            confirmAction.kind === "cancel"
              ? handleCancel(confirmAction.orderId)
              : handleConfirmReceived(confirmAction.orderId);
          void action.finally(() => setConfirmAction(null));
        }}
      />
    </div>
  );
}
