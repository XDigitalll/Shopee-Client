"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientConfirmDialog, ClientFeedbackDock, ClientListLoadingOverlay, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { CLIENT_DATA_CHANGED_EVENT, apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import { cleanDisplayText } from "@/lib/text";
import type { ClientTrackingStep, Order, OrderItem, OrderStats, UserAddress } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";

const RED = "#E8431A";
const GREEN = "#2E8B57";
const FILTERS = [
  { key: "ALL", label: "Todos" },
  { key: "EXTERNAL", label: "Externos" },
  { key: "INTERNAL", label: "Internos" },
  { key: "DELIVERED", label: "Entregues" },
] as const;
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
type AddressDraftState = {
  label: string;
  city: string;
  neighborhood: string;
  street: string;
  houseNumber: string;
  reference: string;
  googleMapsLink: string;
  saveToProfile: boolean;
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
  return order.status === "PAYMENT_REJECTED" || order.status === "FAILED" ? "FAILED" : order.status;
}

function customerStage(status: string) {
  const map: Record<string, "RECEIVED" | "PRICING" | "AWAITING_PAYMENT" | "CONFIRMED" | "PROCESSING" | "INTERNATIONAL_TRANSIT" | "AT_HQ" | "ON_THE_WAY" | "DELIVERED" | "CANCELLED"> = {
    CREATED: "RECEIVED",
    PENDING: "RECEIVED",
    UNDER_REVIEW: "PRICING",
    QUOTED: "PRICING",
    APPROVED: "AWAITING_PAYMENT",
    PENDING_PAYMENT: "AWAITING_PAYMENT",
    PAYMENT_SUBMITTED: "AWAITING_PAYMENT",
    PAYMENT_UNDER_REVIEW: "AWAITING_PAYMENT",
    PAYMENT_REJECTED: "AWAITING_PAYMENT",
    PAID: "CONFIRMED",
    CONFIRMED: "CONFIRMED",
    TO_PURCHASE: "PROCESSING",
    PURCHASED: "PROCESSING",
    ORDERED: "PROCESSING",
    PROCESSING: "PROCESSING",
    SHIPPED: "INTERNATIONAL_TRANSIT",
    IN_TRANSIT: "INTERNATIONAL_TRANSIT",
    ARRIVED: "AT_HQ",
    READY_FOR_DELIVERY: "ON_THE_WAY",
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
    PAYMENT_SUBMITTED: { label: "Pagamento submetido", bg: "#EFF6FF", color: "#1D4ED8" },
    PAYMENT_UNDER_REVIEW: { label: "Pagamento em analise", bg: "#F5F3FF", color: "#5B21B6" },
    PAYMENT_REJECTED: { label: "Pagamento recusado", bg: "#FEE2E2", color: "#991B1B" },
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

function buildPhoneHref(phone: string | null | undefined) {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed.replace(/\s/g, "")}` : null;
}

function emptyAddressDraft(order?: Order): AddressDraftState {
  return {
    label: "Casa",
    city: order?.deliveryCity || "Maputo",
    neighborhood: order?.deliveryNeighborhood || "",
    street: order?.deliveryStreet || "",
    houseNumber: order?.houseNumber || "",
    reference: order?.deliveryReference || "",
    googleMapsLink: order?.googleMapsLink || "",
    saveToProfile: !order?.hasAddresses,
  };
}

function canCustomerCancel(status: string) {
  return ["CREATED", "PENDING_PAYMENT", "PAYMENT_REJECTED"].includes(status);
}

function isInProcessingCannotCancel(status: string) {
  return ["PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW"].includes(status);
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

async function fetchWithToken<T>(url: string, _token: string) {
  const response = await fetch(url, {
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
  const [confirmAction, setConfirmAction] = useState<{ kind: "cancel" | "cancel_order" | "received"; orderId: number } | null>(null);
  const [selectedAddressByOrder, setSelectedAddressByOrder] = useState<Record<number, number>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<number, AddressDraftState>>({});
  const [addressCreateOrderId, setAddressCreateOrderId] = useState<number | null>(null);
  const [addressChangeOrderId, setAddressChangeOrderId] = useState<number | null>(null);
  const [timelineOrderId, setTimelineOrderId] = useState<number | null>(null);

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

  const replaceOrder = (updated: Order) => {
    setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  const selectedAddressIdFor = (order: Order) => {
    return selectedAddressByOrder[order.id]
      ?? order.defaultAddress?.id
      ?? order.savedAddresses?.[0]?.id
      ?? 0;
  };

  const selectDeliveryAddress = async (order: Order) => {
    if (!token) return;
    const addressId = selectedAddressIdFor(order);
    if (!addressId) {
      setFeedback({ type: "error", msg: "Escolhe uma morada para este pedido." });
      return;
    }
    setBusyOrderId(order.id);
    try {
      const updated = await apiFetch<Order>(`orders/${order.id}/delivery-address/select`, {
        method: "POST",
        token,
        body: JSON.stringify({ addressId }),
      });
      replaceOrder(updated);
      setAddressChangeOrderId(null);
      setAddressCreateOrderId(null);
      setFeedback({ type: "success", msg: "Morada escolhida para este pedido." });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel escolher a morada." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const updateAddressDraft = (order: Order, patch: Partial<AddressDraftState>) => {
    setAddressDrafts((current) => ({
      ...current,
      [order.id]: {
        ...(current[order.id] ?? emptyAddressDraft(order)),
        ...patch,
      },
    }));
  };

  const createDeliveryAddress = async (order: Order) => {
    if (!token) return;
    const draft = addressDrafts[order.id] ?? emptyAddressDraft(order);
    if (!draft.label.trim() || !draft.city.trim() || !draft.neighborhood.trim() || !draft.street.trim() || !draft.reference.trim()) {
      setFeedback({ type: "error", msg: "Preenche nome, cidade, bairro, rua e referencia." });
      return;
    }

    setBusyOrderId(order.id);
    try {
      const updated = await apiFetch<Order>(`orders/${order.id}/delivery-address/create`, {
        method: "POST",
        token,
        body: JSON.stringify({
          saveToProfile: draft.saveToProfile,
          address: {
            label: draft.label,
            city: draft.city,
            neighborhood: draft.neighborhood,
            street: draft.street,
            houseNumber: draft.houseNumber,
            reference: draft.reference,
            googleMapsLink: draft.googleMapsLink,
            defaultAddress: draft.saveToProfile && !order.hasAddresses,
          },
        }),
      });
      replaceOrder(updated);
      setAddressCreateOrderId(null);
      setAddressChangeOrderId(null);
      setFeedback({ type: "success", msg: draft.saveToProfile ? "Morada guardada e escolhida para este pedido." : "Morada escolhida apenas para este pedido." });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel guardar a morada do pedido." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const confirmDeliveryAddress = async (order: Order) => {
    if (!token) return;
    setBusyOrderId(order.id);
    try {
      const updated = await apiFetch<Order>(`orders/${order.id}/delivery-address/confirm`, {
        method: "PATCH",
        token,
      });
      replaceOrder(updated);
      setFeedback({ type: "success", msg: "Morada confirmada. A equipa de entrega já pode avançar." });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel confirmar a morada." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCancel = async (orderId: number) => {
    if (!token) return;
    const orderLabel = orderDisplayCode(orders.find((order) => order.id === orderId));
    setBusyOrderId(orderId);
    try {
      await apiFetch(`orders/${orderId}/cancel`, { method: "PUT", token });
      setFeedback({ type: "success", msg: `Pedido ${orderLabel} cancelado com sucesso.` });
      await loadOrders();
    } catch (error) {
      console.error("[cancel order]", error);
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Não foi possível cancelar o pedido." });
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

  const markOrderUpdatesSeen = async (orderId: number) => {
    if (!token) return;
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, unreadUpdatesCount: 0, requiresAction: false } : order));
    await apiFetch(`customer/orders/${orderId}/mark-updates-seen`, { method: "PATCH", token }).catch(() => null);
  };

  const statsCards = [
    { label: "Total de pedidos", value: stats.totalOrders, accent: RED },
    { label: "Em andamento", value: stats.inProgress, accent: "#92400E" },
    { label: "Entregues", value: stats.delivered, accent: GREEN },
  ];

  function buildVerticalTimeline(order: Order): { key: string; label: string; desc: string; done: boolean; current: boolean; failed: boolean; ts: string | null }[] {
    const backendSteps = order.trackingDetailSteps;
    if (backendSteps && backendSteps.length > 0) {
      return backendSteps.map((step: ClientTrackingStep) => ({
        key: step.key,
        label: step.label,
        desc: step.description ?? "",
        done: step.state === "COMPLETED",
        current: step.state === "CURRENT",
        failed: step.state === "FAILED",
        ts: step.occurredAt ?? null,
      }));
    }
    return [];
  }

  const renderAddressChoice = (order: Order) => {
    const addresses = order.savedAddresses ?? [];
    const selectedId = selectedAddressIdFor(order);
    const showCreate = addressCreateOrderId === order.id || order.requiresAddressCreation;
    const draft = addressDrafts[order.id] ?? emptyAddressDraft(order);

    return (
      <div className="mt-4 space-y-4">
        {addresses.length > 0 && !showCreate ? (
          <div className="space-y-2">
            <p className="text-sm font-black" style={{ color: "#5B21B6" }}>Escolhe onde queres receber:</p>
            {addresses.map((address: UserAddress) => (
              <label key={address.id} className="flex cursor-pointer gap-3 rounded-2xl border p-3 text-sm" style={{ borderColor: selectedId === address.id ? RED : "#DDD6FE", background: selectedId === address.id ? "#FFF8F5" : "white" }}>
                <input
                  type="radio"
                  name={`address-${order.id}`}
                  checked={selectedId === address.id}
                  onChange={() => setSelectedAddressByOrder((current) => ({ ...current, [order.id]: address.id }))}
                />
                <span>
                  <strong className="block" style={{ color: "#1A1410" }}>{address.label}{address.defaultAddress ? " · Predefinida" : ""}</strong>
                  <span style={{ color: "#5B21B6" }}>{address.fullAddress}</span>
                </span>
              </label>
            ))}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void selectDeliveryAddress(order)} disabled={busyOrderId === order.id} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
                {busyOrderId === order.id ? "A guardar..." : "Usar esta morada"}
              </button>
              <button type="button" onClick={() => setAddressCreateOrderId(order.id)} className="rounded-2xl border px-4 py-2.5 text-sm font-black" style={{ borderColor: "#DDD6FE", color: "#5B21B6" }}>
                Adicionar novo local
              </button>
            </div>
          </div>
        ) : null}

        {showCreate ? (
          <div className="rounded-2xl border p-4" style={{ borderColor: "#DDD6FE", background: "white" }}>
            <p className="text-sm font-black" style={{ color: "#5B21B6" }}>
              {addresses.length ? "Adicionar novo local" : "Ainda não tens uma morada guardada"}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {([
                ["label", "Nome da morada"],
                ["city", "Cidade"],
                ["neighborhood", "Bairro"],
                ["street", "Rua/Avenida"],
                ["houseNumber", "Casa/apartamento"],
                ["reference", "Referência"],
              ] as const).map(([key, label]) => (
                <label key={key} className={key === "reference" ? "block md:col-span-2" : "block"}>
                  <span className="mb-1 block text-sm font-semibold" style={{ color: "#6B7280" }}>{label}</span>
                  <input
                    value={draft[key]}
                    onChange={(event) => updateAddressDraft(order, { [key]: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#DDD6FE", background: "#FFFDFC" }}
                  />
                </label>
              ))}
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-semibold" style={{ color: "#6B7280" }}>Link Google Maps</span>
                <input
                  value={draft.googleMapsLink}
                  onChange={(event) => updateAddressDraft(order, { googleMapsLink: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#DDD6FE", background: "#FFFDFC" }}
                />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "#5B21B6" }}>
              <input
                type="checkbox"
                checked={draft.saveToProfile}
                onChange={(event) => updateAddressDraft(order, { saveToProfile: event.target.checked })}
              />
              Guardar no perfil
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => void createDeliveryAddress(order)} disabled={busyOrderId === order.id} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
                {busyOrderId === order.id ? "A guardar..." : "Guardar morada do pedido"}
              </button>
              {addresses.length ? (
                <button type="button" onClick={() => setAddressCreateOrderId(null)} className="rounded-2xl border px-4 py-2.5 text-sm font-black" style={{ borderColor: "#DDD6FE", color: "#5B21B6" }}>
                  Voltar às moradas
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderOrderCard = (order: Order, options?: { nested?: boolean }) => {
    const isExternal = order.type === "EXTERNAL";
    const status = effectiveOrderStatus(order);
    const isNested = options?.nested;
    const chips = itemChips(order);
    const meta = (isExternal && status === "ARRIVED")
      ? { label: "Na nossa sede", bg: "#EDE9FE", color: "#5B21B6" }
      : statusMeta(status);
    const trackingSteps = order.trackingSummarySteps ?? [];
    const showTimeline = timelineOrderId === order.id;
    const unreadUpdates = Number(order.unreadUpdatesCount ?? 0);
    const requiresAction = Boolean(order.requiresAction);
    const attentionLabel = order.attentionLabel || (requiresAction ? "Ação necessária" : unreadUpdates > 0 ? "Nova atualização" : "");
    const canConfirmAddress = Boolean(order.canConfirmAddress);
    const canChangeDeliveryAddress = Boolean(order.canChangeDeliveryAddress);
    const canConfirmDelivery = Boolean(order.canConfirmDelivery);

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
                {requiresAction || unreadUpdates > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black" style={{ background: requiresAction ? "#FEE2E2" : "#FFF7ED", color: requiresAction ? "#B42318" : "#C2410C" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: "#F97316" }} />
                    {requiresAction ? "Ação necessária" : "Nova atualização"} · {attentionLabel}
                  </span>
                ) : null}
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

        {trackingSteps.length > 0 && (
          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex items-center" style={{ minWidth: `${Math.max(trackingSteps.length * 84, 500)}px` }}>
              {trackingSteps.map((step, index) => {
                const done = step.state === "COMPLETED";
                const current = step.state === "CURRENT";
                const failed = step.state === "FAILED";
                const dotBg = done ? RED : current ? "white" : failed ? "#B42318" : "transparent";
                const dotBorder = failed ? "#B42318" : RED;
                const labelColor = failed ? "#B42318" : current || done ? RED : "#9CA3AF";
                return (
                  <div key={step.key} className="flex min-w-[84px] flex-1 items-center">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-4 w-4 rounded-full border-2" style={{ background: dotBg, borderColor: dotBorder }} />
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: labelColor }}>
                        {current && unreadUpdates > 0 ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#F97316" }} /> : null}
                        {step.label}
                      </span>
                    </div>
                    {index < trackingSteps.length - 1 && <div className="mx-2 h-[2px] flex-1" style={{ background: done ? RED : "#F2D4CC" }} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
              <Link href={`/orders/${order.id}/quote`} onClick={() => void markOrderUpdatesSeen(order.id)} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>{order.nextActionLabel || "Ver cotação"}</Link>
              <button type="button" onClick={() => setConfirmAction({ kind: "cancel", orderId: order.id })} disabled={busyOrderId === order.id} className="rounded-2xl px-4 py-2.5 text-sm font-bold" style={{ background: "#FCEBEB", color: "#B42318" }}>
                {busyOrderId === order.id ? "A recusar..." : "Recusar"}
              </button>
            </div>
            {order.code && (
              <p className="mt-3 text-xs" style={{ color: "#92400E" }}>
                Confirma ou recusa a proposta aqui no portal para a equipa avançar com o teu pedido.
              </p>
            )}
          </div>
        )}

        {(status === "ARRIVED" || status === "READY_FOR_DELIVERY") && order.deliveryMethod !== "STORE_PICKUP" && (isExternal || order.lastIssueType || order.requiresAddressSelection || order.requiresAddressCreation || canConfirmAddress || canChangeDeliveryAddress) && (
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
                <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>A tua encomenda chegou a Maputo</h3>
                {order.deliveryStatusLabel ? (
                  <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>{order.deliveryStatusLabel}</p>
                ) : null}
                {order.deliveryAddressSnapshot && addressChangeOrderId !== order.id ? (
                  <>
                    <p className="mt-1 text-sm font-semibold" style={{ color: "#5B21B6" }}>Entrega prevista para:</p>
                    <div className="mt-3 rounded-2xl bg-white p-4 text-sm" style={{ color: "#1A1410" }}>
                      <strong className="block">{order.deliveryAddressSnapshot.label || "Morada escolhida"}</strong>
                      <span>{order.deliveryAddressSnapshot.fullAddress || buildDeliveryAddress(order)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {canChangeDeliveryAddress ? (
                        <button type="button" onClick={() => setAddressChangeOrderId(order.id)} className="rounded-2xl border px-4 py-2.5 text-sm font-black" style={{ borderColor: "#DDD6FE", color: "#5B21B6" }}>
                          Alterar morada
                        </button>
                      ) : null}
                      {canConfirmAddress ? (
                        <button type="button" onClick={() => void confirmDeliveryAddress(order)} disabled={busyOrderId === order.id} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
                          {busyOrderId === order.id ? "A confirmar..." : "Confirmar morada"}
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : order.requiresAddressSelection || addressChangeOrderId === order.id ? (
                  renderAddressChoice(order)
                ) : order.requiresAddressCreation ? (
                  renderAddressChoice(order)
                ) : (
                  <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>A equipa vai preparar a entrega com a morada escolhida para este pedido.</p>
                )}
              </>
            )}
          </div>
        )}

        {status === "OUT_FOR_DELIVERY" && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
            <h3 className="text-base font-black" style={{ color: "#1D4ED8", fontFamily: "'Sora', sans-serif" }}>A tua encomenda está a caminho</h3>
            <p className="mt-1 text-sm" style={{ color: "#1D4ED8" }}>{order.deliveryStatusLabel || "A equipa de delivery está a caminho da tua morada com a tua encomenda."}</p>
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
            <p className="mt-2 text-sm" style={{ color: "#1D4ED8", whiteSpace: "pre-wrap" }}>{cleanDisplayText(order.adminMessageForClient)}</p>
          </div>
        )}

        {isInProcessingCannotCancel(status) && (
          <div className="mt-4 rounded-[24px] border px-4 py-3 text-sm" style={{ background: "#F9FAFB", borderColor: "#E5E7EB", color: "#6B7280" }}>
            Este pedido ja entrou em processamento e nao pode ser cancelado pelo portal. Fala connosco pelo suporte.
          </div>
        )}

        <div className="mt-4 border-t pt-3" style={{ borderColor: "#F2D4CC" }}>
          <button
            type="button"
            onClick={() => {
              setTimelineOrderId((prev) => (prev === order.id ? null : order.id));
              if (!showTimeline) void markOrderUpdatesSeen(order.id);
            }}
            className="flex items-center gap-1.5 text-xs font-black"
            style={{ color: RED }}
          >
            <svg
              width="12" height="12" viewBox="0 0 20 20" fill="currentColor"
              className={`transition-transform ${showTimeline ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
            {showTimeline ? "Ocultar histórico" : "Ver histórico do pedido"}
          </button>

          {showTimeline && (
            <ol className="mt-4 space-y-0" aria-label="Histórico do pedido">
              {buildVerticalTimeline(order).map((step, i, arr) => {
                const isLast = i === arr.length - 1;
                const active = step.current || step.failed;
                const dotColor = step.failed ? "#B42318" : step.current ? RED : step.done ? "#166534" : "#D1D5DB";
                const lineColor = step.done ? "#166534" : "#E5E7EB";
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black"
                        style={{
                          borderColor: dotColor,
                          background: step.failed ? "#FEE2E2" : step.current ? RED : step.done ? "#ECFDF5" : "white",
                          color: step.failed ? "#B42318" : step.current ? "white" : step.done ? "#166534" : "#D1D5DB",
                        }}
                      >
                        {step.failed ? "✕" : step.done ? "✓" : step.current ? "●" : "○"}
                      </div>
                      {!isLast && <div className="w-px grow" style={{ background: lineColor, minHeight: "20px" }} />}
                    </div>
                    <div className="pb-4 pt-0.5">
                      <p className="text-sm font-black" style={{ color: active ? (step.failed ? "#B42318" : RED) : step.done ? "#1A1410" : "#9CA3AF" }}>
                        {step.label}
                      </p>
                      <p className="text-xs font-medium leading-5" style={{ color: "#6B7280" }}>{step.desc}</p>
                      {step.ts && (
                        <p className="mt-0.5 text-[11px] font-semibold" style={{ color: "#9CA3AF" }}>
                          {formatDate(step.ts)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "#F2D4CC" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{status === "DELIVERED" ? "Total pago" : "Valor do pedido"}</p>
            <p className="mt-1 text-2xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(orderTotal(order))}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {(order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_REJECTED") && !order.payOnDelivery && <Link href={`/orders/${order.id}/payment`} onClick={() => void markOrderUpdatesSeen(order.id)} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>{order.nextActionLabel || (order.status === "PAYMENT_REJECTED" ? "Enviar novo comprovativo" : "Submeter pagamento")}</Link>}
            {status === "OUT_FOR_DELIVERY" && <a href={order.googleMapsLink || order.externalCartUrl || "#"} target="_blank" rel="noreferrer" onClick={() => void markOrderUpdatesSeen(order.id)} className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#D8B4FE", color: "#6B21A8" }}>Rastrear</a>}
            {canConfirmDelivery && (
              <button
                type="button"
                onClick={() => setConfirmAction({ kind: "received", orderId: order.id })}
                disabled={busyOrderId === order.id}
                className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: busyOrderId === order.id ? "#FDB8A7" : RED }}
              >
                {busyOrderId === order.id ? "A confirmar..." : "Confirmar receção"}
              </button>
            )}
            {status === "DELIVERED" && <Link href={`/orders/${order.id}/receipt`} className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>Ver detalhes</Link>}
            {status === "DELIVERED" && <Link href="/store" className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>Repetir pedido</Link>}
            {canCustomerCancel(status) && (
              <button
                type="button"
                onClick={() => setConfirmAction({ kind: "cancel_order", orderId: order.id })}
                disabled={busyOrderId === order.id}
                className="rounded-2xl border px-4 py-2.5 text-sm font-bold"
                style={{ borderColor: "#FCA5A5", color: "#B91C1C", background: "#FEF2F2" }}
              >
                {busyOrderId === order.id ? "A cancelar..." : "Cancelar pedido"}
              </button>
            )}
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
        title={
          confirmAction?.kind === "cancel" ? "Recusar esta proposta?" :
          confirmAction?.kind === "cancel_order" ? "Cancelar este pedido?" :
          "Confirmar recebimento?"
        }
        message={
          confirmAction?.kind === "cancel"
            ? `O pedido ${orderDisplayCode(orders.find((order) => order.id === confirmAction.orderId))} sera marcado como recusado e a equipa sera informada.`
            : confirmAction?.kind === "cancel_order"
            ? "Esta acao nao pode ser desfeita. O pedido sera cancelado e a equipa sera informada."
            : `Vamos marcar o pedido ${orderDisplayCode(orders.find((order) => order.id === confirmAction?.orderId))} como recebido para fechar esta etapa.`
        }
        confirmLabel={
          confirmAction?.kind === "cancel" || confirmAction?.kind === "cancel_order" ? "Cancelar pedido" : "Confirmar recebido"
        }
        danger={confirmAction?.kind === "cancel" || confirmAction?.kind === "cancel_order"}
        pending={busyOrderId === confirmAction?.orderId}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          const action =
            confirmAction.kind === "cancel" || confirmAction.kind === "cancel_order"
              ? handleCancel(confirmAction.orderId)
              : handleConfirmReceived(confirmAction.orderId);
          void action.finally(() => setConfirmAction(null));
        }}
      />
    </div>
  );
}
