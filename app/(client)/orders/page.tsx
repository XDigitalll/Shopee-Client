"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientConfirmDialog, ClientFeedbackDock, ClientListLoadingOverlay, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { ApiRequestError, CLIENT_DATA_CHANGED_EVENT, apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import { cleanDisplayText } from "@/lib/text";
import type { ClarificationField, ClientTrackingStep, Order, OrderItem, OrderStats, UserAddress } from "@/lib/types";
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
const CLARIFICATION_LABELS: Record<ClarificationField | string, string> = {
  SIZE: "Tamanho",
  COLOR: "Cor",
  MODEL: "Modelo",
  QUANTITY: "Quantidade",
  STORAGE: "Memória/capacidade",
  LINK: "Link correto",
  PHOTO: "Fotos ou capturas de ecrã",
  OTHER: "Outro detalhe",
};
type ExternalEditDraftState = {
  productInput: string;
  productDetails: string;
  quantity: string;
  primaryPhoneNumber: string;
  version?: number;
};
type ClarificationDraftState = {
  answers: Record<string, string>;
  photos: File[];
  submitted?: boolean;
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

const PAYMENT_BLOCKED_ORDER_STATUSES = new Set([
  "CANCELLED",
  "DELIVERED",
  "REFUNDED",
  "PAYMENT_CANCELLED",
  "ORDER_CANCELLED_BY_CUSTOMER",
]);

function canShowPaymentAction(order: Order) {
  const status = String(order.status ?? "").toUpperCase();
  return !PAYMENT_BLOCKED_ORDER_STATUSES.has(status)
    && (status === "PENDING_PAYMENT" || status === "PAYMENT_REJECTED")
    && !order.payOnDelivery;
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
    AWAITING_DELIVERY_PAYMENT: "ON_THE_WAY",
    DELIVERY_FAILED: "ON_THE_WAY",
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
    DELIVERY_FAILED: { label: "Tentativa falhada", bg: "#FEF3C7", color: "#92400E" },
  };

  return map[status] || map[customerStage(status)] || { label: status, bg: "#F3F4F6", color: "#4B5563" };
}

function orderTotal(order: Order) {
  return orderVisibleTotal(order);
}

function orderItemChipKey(item: OrderItem, index: number) {
  return [
    "item",
    item.productId ?? "no-product",
    item.variantId ?? item.variantSku ?? item.selectedVariantLabel ?? item.variantLabel ?? "no-variant",
    item.productCode ?? item.productName ?? "no-name",
    item.quantity,
    item.subtotal ?? item.price ?? "no-total",
    index,
  ].join("-");
}

function itemChips(order: Order) {
  if (order.items?.length) {
    return order.items.slice(0, 4).map((item: OrderItem, index) => ({
      key: orderItemChipKey(item, index),
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

function deliveryPriceInfo(order: Order) {
  const explicitPrice = [order.deliveryPrice, order.shippingPrice, order.assignedDeliveryFee]
    .filter((value) => value !== null && value !== undefined)
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value));
  const fallbackFee = Number(order.deliveryFee);
  const amount = explicitPrice ?? (fallbackFee > 0 ? fallbackFee : undefined);

  if (amount === undefined) {
    return {
      kind: "pending" as const,
      title: "Preço da entrega será confirmado pela equipa",
      payment: null,
    };
  }

  if (amount <= 0) {
    return {
      kind: "free" as const,
      title: "Entrega grátis",
      payment: null,
    };
  }

  return {
    kind: "priced" as const,
    title: formatMoney(amount),
    payment: order.deliveryPaymentMode || (order.payOnDelivery ? "Na entrega" : null),
  };
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

function emptyExternalEditDraft(order: Order): ExternalEditDraftState {
  return {
    productInput: order.externalCartUrl || order.productDetails || "",
    productDetails: order.productDetails || "",
    quantity: String(order.requestedQuantity || 1),
    primaryPhoneNumber: order.primaryPhoneNumber || "",
    version: order.version,
  };
}

function canEditExternalOrder(order: Order) {
  const status = effectiveOrderStatus(order);
  return order.type === "EXTERNAL"
    && (status === "CREATED"
      || status === "UNDER_REVIEW"
      || (status === "QUOTED" && Boolean(order.needsCustomerCorrection)));
}

function lockedEditMessage(status: string) {
  if (status === "QUOTED") {
    return "Este pedido ja avancou para cotacao. Para evitar erro na compra, so podes editar se a equipa pedir uma correcao.";
  }
  if (["PENDING_PAYMENT", "PAID", "TO_PURCHASE", "PURCHASED", "ORDERED", "IN_TRANSIT", "ARRIVED", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status)) {
    return "Este pedido ja avancou para cotacao ou pagamento, por isso ja nao pode ser editado diretamente.";
  }
  return null;
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
    return "Um pagamento desta compra foi recusado. Acompanha a mensagem da ShopeeMz para saber o motivo.";
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
  const searchParams = useSearchParams();
  const highlightParam = searchParams.get("highlight")?.trim() ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({ totalOrders: 0, inProgress: 0, delivered: 0, totalSpent: 0 });
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [locatingOrderId, setLocatingOrderId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: "cancel" | "cancel_order" | "received"; orderId: number } | null>(null);
  const [selectedAddressByOrder, setSelectedAddressByOrder] = useState<Record<number, number>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<number, AddressDraftState>>({});
  const [addressCreateOrderId, setAddressCreateOrderId] = useState<number | null>(null);
  const [addressChangeOrderId, setAddressChangeOrderId] = useState<number | null>(null);
  const [externalEditOrderId, setExternalEditOrderId] = useState<number | null>(null);
  const [externalEditDrafts, setExternalEditDrafts] = useState<Record<number, ExternalEditDraftState>>({});
  const [externalEditConflict, setExternalEditConflict] = useState<{
    orderId: number;
    code: "ORDER_CHANGED" | "NOT_EDITABLE_STATUS" | string;
    currentStatus?: string;
  } | null>(null);
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<number, ClarificationDraftState>>({});
  const [timelineOrderId, setTimelineOrderId] = useState<number | null>(null);
  const highlightedOrderRef = useRef<HTMLElement | null>(null);

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
  const highlightedOrderId = useMemo(() => {
    if (!highlightParam) return null;
    const normalized = highlightParam.toLowerCase();
    return orders.find((order) =>
      String(order.id) === highlightParam ||
      String(order.code ?? "").toLowerCase() === normalized ||
      orderDisplayCode(order).toLowerCase() === normalized
    )?.id ?? null;
  }, [highlightParam, orders]);

  useEffect(() => {
    if (!highlightedOrderId || isLoading) return;

    const timer = window.setTimeout(() => {
      highlightedOrderRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [highlightedOrderId, isLoading]);

  const replaceOrder = (updated: Order) => {
    setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  const updateClarificationAnswer = (orderId: number, field: ClarificationField, value: string) => {
    setClarificationDrafts((current) => ({
      ...current,
      [orderId]: {
        answers: {
          ...(current[orderId]?.answers ?? {}),
          [field]: value,
        },
        photos: current[orderId]?.photos ?? [],
        submitted: current[orderId]?.submitted,
      },
    }));
  };

  const updateClarificationPhotos = (orderId: number, files: FileList | null) => {
    const photos = Array.from(files ?? []).slice(0, 3);
    setClarificationDrafts((current) => ({
      ...current,
      [orderId]: {
        answers: current[orderId]?.answers ?? {},
        photos,
        submitted: current[orderId]?.submitted,
      },
    }));
  };

  const submitClarificationAnswer = async (order: Order) => {
    if (!token || !order.activeClarificationRequest) return;

    const request = order.activeClarificationRequest;
    const draft = clarificationDrafts[order.id] ?? { answers: {}, photos: [] };
    const requestedFields = request.requestedFields ?? [];
    const answers = requestedFields.reduce<Record<string, string>>((acc, field) => {
      if (field !== "PHOTO") {
        acc[field] = draft.answers[field] ?? "";
      }
      return acc;
    }, {});

    setBusyOrderId(order.id);
    try {
      const endpoint = `orders/${order.id}/clarification-request/${request.id}/answer`;
      if (requestedFields.includes("PHOTO")) {
        const body = new FormData();
        body.append("answers", JSON.stringify(answers));
        draft.photos.slice(0, 3).forEach((photo) => body.append("photos", photo));
        await apiFetch(endpoint, { method: "POST", token, body });
      } else {
        await apiFetch(endpoint, {
          method: "POST",
          token,
          body: JSON.stringify({ answers }),
        });
      }

      setClarificationDrafts((current) => ({
        ...current,
        [order.id]: { ...draft, submitted: true },
      }));
      await loadOrders({ silent: true });
      setFeedback({ type: "success", msg: "Detalhes enviados. A equipa vai rever e preparar a tua cotação." });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel enviar os detalhes." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const selectedAddressIdFor = (order: Order) => {
    return selectedAddressByOrder[order.id]
      ?? order.defaultAddress?.id
      ?? order.savedAddresses?.[0]?.id
      ?? 0;
  };

  const startExternalEdit = (order: Order) => {
    setExternalEditConflict(null);
    setExternalEditOrderId(order.id);
    setExternalEditDrafts((current) => ({
      ...current,
      [order.id]: emptyExternalEditDraft(order),
    }));
  };

  const updateExternalEditDraft = (order: Order, patch: Partial<ExternalEditDraftState>) => {
    setExternalEditDrafts((current) => ({
      ...current,
      [order.id]: {
        ...(current[order.id] ?? emptyExternalEditDraft(order)),
        ...patch,
      },
    }));
  };

  const saveExternalEdit = async (order: Order) => {
    if (!token) return;
    const draft = externalEditDrafts[order.id] ?? emptyExternalEditDraft(order);
    const quantity = Number.parseInt(draft.quantity, 10);

    if (!draft.productInput.trim()) {
      setFeedback({ type: "error", msg: "Indica o link ou descricao do produto." });
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      setFeedback({ type: "error", msg: "A quantidade deve ser pelo menos 1." });
      return;
    }

    setBusyOrderId(order.id);
    try {
      const updated = await apiFetch<Order>(`orders/${order.id}/customer-edit`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          productLink: draft.productInput.trim(),
          productDetails: draft.productDetails.trim(),
          quantity,
          primaryPhoneNumber: draft.primaryPhoneNumber.trim(),
          version: draft.version ?? order.version,
        }),
      });
      replaceOrder(updated);
      setExternalEditOrderId(null);
      setFeedback({ type: "success", msg: "Informacoes do pedido atualizadas." });
    } catch (error) {
      if (error instanceof ApiRequestError
        && (error.code === "ORDER_CHANGED" || error.code === "NOT_EDITABLE_STATUS" || error.status === 409)) {
        setExternalEditConflict({
          orderId: order.id,
          code: error.code || "ORDER_CHANGED",
          currentStatus: error.currentStatus,
        });
        setExternalEditOrderId(null);
        setFeedback(null);
        return;
      }
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel atualizar este pedido." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const refreshAfterExternalConflict = async () => {
    setExternalEditConflict(null);
    setExternalEditOrderId(null);
    await loadOrders({ silent: true });
    setFeedback({ type: "info", msg: "Pedido atualizado com os dados mais recentes." });
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

  const startAddressChange = (order: Order) => {
    setAddressChangeOrderId(order.id);
    setAddressCreateOrderId((order.savedAddresses?.length ?? 0) > 0 ? null : order.id);
    setAddressDrafts((current) => ({
      ...current,
      [order.id]: current[order.id] ?? emptyAddressDraft(order),
    }));
  };

  const applyCurrentLocationForAddress = (order: Order) => {
    if (!navigator.geolocation) {
      setFeedback({ type: "info", msg: "N\u00E3o foi poss\u00EDvel obter localiza\u00E7\u00E3o. Pode continuar preenchendo manualmente." });
      return;
    }

    setLocatingOrderId(order.id);

    const applyPosition = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      updateAddressDraft(order, { googleMapsLink: mapsLink });
      setFeedback({ type: "success", msg: "Localizacao actual adicionada ao Google Maps." });
      setLocatingOrderId(null);
    };

    const errorMessage = () => {
      return "N\u00E3o foi poss\u00EDvel obter localiza\u00E7\u00E3o. Pode continuar preenchendo manualmente.";
    };

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (firstError) => {
        if (firstError.code === firstError.PERMISSION_DENIED) {
          setFeedback({ type: "info", msg: errorMessage() });
          setLocatingOrderId(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          applyPosition,
          (secondError) => {
            setFeedback({ type: "info", msg: errorMessage() });
            setLocatingOrderId(null);
          },
          { enableHighAccuracy: false, timeout: 30000, maximumAge: 300000 },
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 },
    );
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
      await apiFetch<Order>(`customer/orders/${orderId}/confirm-delivery`, { method: "PATCH", token });
      setFeedback({ type: "success", msg: `Pedido ${orderLabel} confirmado como recebido.` });
      await loadOrders();
      setConfirmAction(null);
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel confirmar o recebimento." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const markOrderUpdatesSeen = async (orderId: number) => {
    if (!token) return;
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, unreadUpdatesCount: 0 } : order));
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
    const showCreate =
      addressCreateOrderId === order.id ||
      order.requiresAddressCreation ||
      (addressChangeOrderId === order.id && addresses.length === 0);
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
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={draft.googleMapsLink}
                    onChange={(event) => updateAddressDraft(order, { googleMapsLink: event.target.value })}
                    className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#DDD6FE", background: "#FFFDFC" }}
                    placeholder="Cola o link do Google Maps, se tiveres"
                  />
                  <button
                    type="button"
                    onClick={() => applyCurrentLocationForAddress(order)}
                    disabled={locatingOrderId === order.id}
                    className="rounded-2xl border px-4 py-3 text-sm font-black disabled:opacity-60"
                    style={{ borderColor: "#DDD6FE", color: "#5B21B6", background: "#F5F3FF" }}
                  >
                    {locatingOrderId === order.id ? "A obter..." : "\uD83D\uDCCD Usar localização atual (opcional)"}
                  </button>
                </div>
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
    const canChangeDeliveryAddress = Boolean(order.canChangeDeliveryAddress);
    const isCod = order.paymentMethod === "CASH_ON_DELIVERY";
    const isInternalCod = !isExternal && isCod;
    const canConfirmDelivery = !isInternalCod && (Boolean(order.canConfirmDelivery) || status === "OUT_FOR_DELIVERY");
    const canEditOrder = canEditExternalOrder(order);
    const editingExternal = externalEditOrderId === order.id;
    const externalDraft = externalEditDrafts[order.id] ?? emptyExternalEditDraft(order);
    const editConflict = externalEditConflict?.orderId === order.id ? externalEditConflict : null;
    const editLockedMessage = isExternal && !canEditOrder ? lockedEditMessage(status) : null;
    const activeClarification = order.activeClarificationRequest?.status === "PENDING"
      ? order.activeClarificationRequest
      : null;
    const clarificationDraft = clarificationDrafts[order.id] ?? { answers: {}, photos: [] };
    const clarificationSubmitted = Boolean(clarificationDraft.submitted);
    const isHighlightedOrder = highlightedOrderId === order.id;
    const screenshotUrls = order.requestScreenshotUrls?.length
      ? order.requestScreenshotUrls
      : order.requestScreenshotUrl
        ? [order.requestScreenshotUrl]
        : [];

    return (
      <article
        key={order.id}
        ref={isHighlightedOrder ? highlightedOrderRef : undefined}
        className={`rounded-[28px] border bg-white p-5 transition ${isNested ? "shadow-none" : "shadow-sm"}`}
        style={{
          borderColor: isHighlightedOrder ? RED : isNested ? "#F6CFC2" : "#F2D4CC",
          boxShadow: isHighlightedOrder ? "0 0 0 4px rgba(232,67,26,0.12), 0 24px 70px rgba(232,67,26,0.16)" : undefined,
        }}
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

        {isExternal ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#FFFBF8", borderColor: "#F2D4CC" }}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>Loja escolhida</p>
                <p className="mt-1 text-sm font-bold" style={{ color: "#1A1410" }}>{order.sourceStore || "Loja externa"}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>Quantidade</p>
                <p className="mt-1 text-sm font-bold" style={{ color: "#1A1410" }}>{order.requestedQuantity || 1}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>Link ou descricao enviada</p>
                <p className="mt-1 break-words text-sm" style={{ color: "#1A1410", whiteSpace: "pre-wrap" }}>
                  {order.externalCartUrl || order.productDetails || "Sem descricao informada"}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>Caracteristicas informadas</p>
                <p className="mt-1 text-sm" style={{ color: "#1A1410", whiteSpace: "pre-wrap" }}>
                  {order.productDetails || "Nao informado"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>Telefone</p>
                <p className="mt-1 text-sm font-bold" style={{ color: "#1A1410" }}>{order.primaryPhoneNumber || "Nao informado"}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>Fotos/screenshots</p>
                {screenshotUrls.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {screenshotUrls.map((url, index) => (
                      <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="rounded-2xl border px-3 py-2 text-xs font-black" style={{ borderColor: "#F2D4CC", color: RED }}>
                        Foto {index + 1}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Sem fotos enviadas</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isExternal && order.purchaseConfirmedAt && !order.purchaseProofUrl ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F1FBF4", borderColor: "#B7DFC4" }}>
            <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#166534" }}>Compra confirmada</p>
            <h3 className="mt-1 text-base font-black" style={{ color: "#14532D", fontFamily: "'Sora', sans-serif" }}>
              A equipa ja comprou o teu produto.
            </h3>
            <p className="mt-1 text-sm" style={{ color: "#166534" }}>
              {order.supplierName ? `Comprado em: ${order.supplierName}.` : "A compra foi realizada com sucesso."}
              {order.supplierPurchaseAmount ? ` Valor pago: ${order.supplierPurchaseAmount} MZN.` : ""}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#4B5563" }}>
              O comprovativo sera enviado em breve.
            </p>
          </div>
        ) : null}

        {isExternal && order.purchaseProofUrl ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F1FBF4", borderColor: "#B7DFC4" }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#166534" }}>Comprovativo da compra</p>
                <h3 className="mt-1 text-base font-black" style={{ color: "#14532D", fontFamily: "'Sora', sans-serif" }}>
                  Ja compramos o teu produto ao fornecedor.
                </h3>
                <p className="mt-1 text-sm" style={{ color: "#166534" }}>
                  {order.purchaseNote || "O comprovativo da compra ja esta disponivel."}
                </p>
                <p className="mt-2 text-xs font-semibold" style={{ color: "#4B5563" }}>
                  {order.supplierName ? `Loja: ${order.supplierName}. ` : ""}
                  {order.purchaseProofUploadedAt ? `Data: ${formatDate(order.purchaseProofUploadedAt)}.` : ""}
                </p>
              </div>
              <a
                href={order.purchaseProofUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl px-4 py-2.5 text-center text-sm font-black text-white"
                style={{ background: GREEN }}
              >
                Ver comprovativo
              </a>
            </div>
          </div>
        ) : null}

        {editConflict ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}>
            <h3 className="text-base font-black" style={{ color: "#1D4ED8", fontFamily: "'Sora', sans-serif" }}>
              O pedido foi atualizado pela equipa
            </h3>
            <p className="mt-2 text-sm" style={{ color: "#1D4ED8" }}>
              Enquanto editavas, este pedido recebeu uma atualizacao. Para evitar erros na compra, confirma novamente os dados atuais.
            </p>
            {editConflict.code === "NOT_EDITABLE_STATUS" ? (
              <p className="mt-2 text-sm font-semibold" style={{ color: "#1D4ED8" }}>
                Este pedido ja avancou de estado e ja nao pode ser editado diretamente.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refreshAfterExternalConflict()}
                className="rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: RED }}
              >
                Atualizar pedido
              </button>
              <Link href="/contact" className="rounded-2xl border px-4 py-2.5 text-sm font-black" style={{ borderColor: "#BFDBFE", color: "#1D4ED8" }}>
                Falar com suporte
              </Link>
            </div>
          </div>
        ) : null}

        {activeClarification ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#FFF7ED", borderColor: "#FDBA74", boxShadow: "0 16px 40px rgba(249,115,22,0.12)" }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg" style={{ background: "#FFEDD5", color: "#C2410C" }}>
                  !
                </span>
                <div>
                  <h3 className="text-base font-black" style={{ color: "#7C2D12", fontFamily: "'Sora', sans-serif" }}>
                    Precisamos de mais detalhes para cotar o teu pedido
                  </h3>
                  <p className="mt-1 text-sm font-semibold" style={{ color: "#9A3412" }}>
                    Confirma estas informações para a equipa preparar a tua cotação.
                  </p>
                </div>
              </div>
              <span className="inline-flex w-fit rounded-full px-3 py-1 text-xs font-black" style={{ background: "#FED7AA", color: "#7C2D12" }}>
                Resposta pendente
              </span>
            </div>
            {activeClarification.message ? (
              <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm" style={{ color: "#7C2D12", whiteSpace: "pre-wrap" }}>{activeClarification.message}</p>
            ) : null}
            {clarificationSubmitted ? (
              <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold" style={{ color: "#166534" }}>
                Detalhes enviados. A equipa vai rever e preparar a tua cotação.
              </p>
            ) : (
              <div className="mt-4 grid gap-4">
                {activeClarification.requestedFields.filter((field) => field !== "PHOTO").map((field) => (
                  <label key={field} className="block">
                    <span className="mb-1 block text-sm font-bold" style={{ color: "#881337" }}>
                      {CLARIFICATION_LABELS[field] || field}
                    </span>
                    {field === "LINK" || field === "OTHER" ? (
                      <textarea
                        rows={field === "OTHER" ? 3 : 2}
                        value={clarificationDraft.answers[field] ?? ""}
                        onChange={(event) => updateClarificationAnswer(order.id, field, event.target.value)}
                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                        style={{ borderColor: "#FDBA74", background: "white" }}
                      />
                    ) : (
                      <input
                        value={clarificationDraft.answers[field] ?? ""}
                        onChange={(event) => updateClarificationAnswer(order.id, field, event.target.value)}
                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                        style={{ borderColor: "#FDBA74", background: "white" }}
                      />
                    )}
                  </label>
                ))}
                {activeClarification.requestedFields.includes("PHOTO") ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold" style={{ color: "#881337" }}>Fotos ou capturas de ecrã adicionais</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => updateClarificationPhotos(order.id, event.target.files)}
                      className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none"
                      style={{ borderColor: "#FDBA74" }}
                    />
                    <p className="mt-1 text-xs font-semibold" style={{ color: "#9F1239" }}>
                      Podes enviar ate 3 imagens. Selecionadas: {clarificationDraft.photos.length}
                    </p>
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => void submitClarificationAnswer(order)}
                  disabled={busyOrderId === order.id}
                  className="rounded-2xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {busyOrderId === order.id ? "A enviar..." : "Enviar detalhes"}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {!activeClarification && clarificationSubmitted ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}>
            <h3 className="text-base font-black" style={{ color: "#14532D", fontFamily: "'Sora', sans-serif" }}>
              Detalhes enviados com sucesso
            </h3>
            <p className="mt-2 text-sm font-semibold" style={{ color: "#166534" }}>
              A equipa vai rever as informações e continuar a tua cotação.
            </p>
          </div>
        ) : null}

        {order.clarificationHistory?.length ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F8FAFC", borderColor: "#E2E8F0" }}>
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#64748B" }}>
              Respostas anteriores
            </p>
            <h3 className="mt-1 text-sm font-black" style={{ color: "#334155", fontFamily: "'Sora', sans-serif" }}>
              O que já enviaste à equipa
            </h3>
            <div className="mt-3 space-y-3">
              {order.clarificationHistory.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-2xl border px-4 py-3"
                  style={{ borderColor: "#CBD5E1", background: "white" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold" style={{ color: "#64748B" }}>
                      {index === 0 ? "Primeira resposta" : `Atualização ${index}`}
                    </p>
                    {item.answeredAt && (
                      <p className="text-xs" style={{ color: "#94A3B8" }}>
                        {formatDate(item.answeredAt)}
                      </p>
                    )}
                  </div>
                  {item.requestedFields?.filter((f) => f !== "PHOTO").length ? (
                    <div className="mt-2 grid gap-2">
                      {item.requestedFields
                        .filter((f) => f !== "PHOTO")
                        .map((field) => (
                          <div key={field}>
                            <p className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>
                              {CLARIFICATION_LABELS[field] || field}
                            </p>
                            <p className="text-sm font-semibold" style={{ color: "#1E293B" }}>
                              {item.answers?.[field] || "—"}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : null}
                  {item.photoUrls?.length ? (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "#94A3B8" }}>
                      {item.photoUrls.length} foto{item.photoUrls.length !== 1 ? "s" : ""} enviada{item.photoUrls.length !== 1 ? "s" : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {order.needsCustomerCorrection && !activeClarification ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#FFF5D8", borderColor: "#F1D7A8" }}>
            <h3 className="text-base font-black" style={{ color: "#7A5712", fontFamily: "'Sora', sans-serif" }}>
              Precisamos que atualizes algumas informacoes deste pedido.
            </h3>
            {order.customerCorrectionNote ? (
              <p className="mt-2 text-sm" style={{ color: "#7A5712", whiteSpace: "pre-wrap" }}>{order.customerCorrectionNote}</p>
            ) : null}
            {canEditOrder ? (
              <button
                type="button"
                onClick={() => startExternalEdit(order)}
                className="mt-4 rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                style={{ background: RED }}
              >
                Editar informacoes do pedido
              </button>
            ) : null}
          </div>
        ) : null}

        {isExternal && canEditOrder && !order.needsCustomerCorrection && !editingExternal ? (
          <button
            type="button"
            onClick={() => startExternalEdit(order)}
            className="mt-4 rounded-2xl border px-4 py-2.5 text-sm font-black"
            style={{ borderColor: "#F2D4CC", color: RED }}
          >
            Editar informacoes do pedido
          </button>
        ) : null}

        {editLockedMessage && !editConflict ? (
          <div className="mt-4 rounded-[24px] border px-4 py-3 text-sm" style={{ background: "#F9FAFB", borderColor: "#E5E7EB", color: "#6B7280" }}>
            {editLockedMessage}
          </div>
        ) : null}

        {editingExternal && canEditOrder ? (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F9FAFB", borderColor: "#E5E7EB" }}>
            <h3 className="text-base font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Editar informacoes do pedido</h3>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-bold" style={{ color: "#374151" }}>Link ou descricao</span>
                <textarea
                  rows={4}
                  value={externalDraft.productInput}
                  onChange={(event) => updateExternalEditDraft(order, { productInput: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E5E7EB" }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold" style={{ color: "#374151" }}>Caracteristicas do produto</span>
                <input
                  value={externalDraft.productDetails}
                  onChange={(event) => updateExternalEditDraft(order, { productDetails: event.target.value })}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E5E7EB" }}
                  placeholder="Ex: tamanho M, cor preta, 128GB"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold" style={{ color: "#374151" }}>Quantidade</span>
                  <input
                    type="number"
                    min={1}
                    value={externalDraft.quantity}
                    onChange={(event) => updateExternalEditDraft(order, { quantity: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#E5E7EB" }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold" style={{ color: "#374151" }}>Telefone</span>
                  <input
                    value={externalDraft.primaryPhoneNumber}
                    onChange={(event) => updateExternalEditDraft(order, { primaryPhoneNumber: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#E5E7EB" }}
                    placeholder="+2588xxxxxxxx"
                  />
                </label>
              </div>
              <p className="text-xs font-semibold" style={{ color: "#6B7280" }}>
                As fotos enviadas continuam guardadas. Para substituir fotos, fala com a equipa pelo suporte.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveExternalEdit(order)}
                  disabled={busyOrderId === order.id}
                  className="rounded-2xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {busyOrderId === order.id ? "A guardar..." : "Guardar alteracoes"}
                </button>
                <button
                  type="button"
                  onClick={() => setExternalEditOrderId(null)}
                  disabled={busyOrderId === order.id}
                  className="rounded-2xl border px-4 py-2.5 text-sm font-black"
                  style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}

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

        {isInternalCod && (status === "READY_FOR_FULFILLMENT" || status === "PREPARING") && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}>
            <h3 className="text-base font-black" style={{ color: "#166534", fontFamily: "'Sora', sans-serif" }}>O teu pedido está a ser preparado</h3>
            <p className="mt-1 text-sm" style={{ color: "#166534" }}>A equipa esta a preparar o teu pedido para entrega.</p>
            <p className="mt-2 text-sm font-semibold" style={{ color: "#166534" }}>Pagamento no ato de entrega — prepara o valor em dinheiro ou via M-Pesa.</p>
          </div>
        )}

        {(status === "ARRIVED" || status === "READY_FOR_DELIVERY" || status === "DELIVERY_FAILED") && order.deliveryMethod !== "STORE_PICKUP" && (isInternalCod || isExternal || order.lastIssueType || order.requiresAddressSelection || order.requiresAddressCreation || canChangeDeliveryAddress || order.canConfirmAddress) && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F5F3FF", borderColor: "#DDD6FE" }}>
            {order.lastIssueType ? (
              <>
                <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>Tentativa de entrega nao concluida</h3>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  Motivo: {deliveryIssueLabel(order)}. A encomenda voltou para a nossa sede e a equipa vai preparar uma nova tentativa.
                </p>
              </>
            ) : isInternalCod ? (
              <>
                <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>O teu pedido está pronto para entrega</h3>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  A equipa de delivery vai organizar a entrega. Prepara o pagamento em dinheiro ou via M-Pesa para receber o pedido.
                </p>
                {(order.requiresAddressSelection || order.requiresAddressCreation || addressChangeOrderId === order.id) ? (
                  renderAddressChoice(order)
                ) : canChangeDeliveryAddress ? (
                  <div className="mt-4">
                    <button type="button" onClick={() => startAddressChange(order)} className="rounded-2xl border px-4 py-2.5 text-sm font-black" style={{ borderColor: "#DDD6FE", color: "#5B21B6" }}>
                      Alterar morada
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>A tua encomenda chegou a Maputo</h3>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  A morada abaixo sera usada para esta entrega. Altera apenas se quiseres receber noutro local.
                </p>
                {order.deliveryAddressSnapshot && addressChangeOrderId !== order.id ? (
                  <>
                    <p className="mt-1 text-sm font-semibold" style={{ color: "#5B21B6" }}>Entrega prevista para:</p>
                    <div className="mt-3 rounded-2xl bg-white p-4 text-sm" style={{ color: "#1A1410" }}>
                      <strong className="block">{order.deliveryAddressSnapshot.label || "Morada escolhida"}</strong>
                      <span>{order.deliveryAddressSnapshot.fullAddress || buildDeliveryAddress(order)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {canChangeDeliveryAddress ? (
                        <button type="button" onClick={() => startAddressChange(order)} className="rounded-2xl border px-4 py-2.5 text-sm font-black" style={{ borderColor: "#DDD6FE", color: "#5B21B6" }}>
                          Alterar morada
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
            <p className="mt-1 text-sm" style={{ color: "#1D4ED8" }}>
              {isCod
                ? "O estafeta irá solicitar o pagamento quando chegar ao local."
                : "A equipa de delivery está a caminho da tua morada com a tua encomenda."
              }
            </p>
            {(() => {
              const deliveryPrice = deliveryPriceInfo(order);
              return (
              <div className="mt-4 flex flex-col gap-3 rounded-[20px] bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "#1D4ED8" }}>Estafeta</p>
                  <p className="mt-1 text-sm font-black" style={{ color: "#111827", fontFamily: "'Sora', sans-serif" }}>
                    {order.assignedDriverName || "Estafeta atribuido"}
                  </p>
                  {order.assignedDriverPhone ? (
                    <a href={buildPhoneHref(order.assignedDriverPhone) ?? undefined} className="mt-1 inline-flex text-sm font-bold hover:underline" style={{ color: RED }}>
                      {order.assignedDriverPhone}
                    </a>
                  ) : null}
                  <div className="mt-3 rounded-2xl border px-3 py-2.5" style={{ background: "rgba(239, 246, 255, 0.78)", borderColor: "#BFDBFE" }}>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#1D4ED8" }}>Entrega</p>
                    {deliveryPrice.kind === "priced" ? (
                      <>
                        <p className="mt-1 text-sm font-black" style={{ color: "#111827", fontFamily: "'Sora', sans-serif" }}>{deliveryPrice.title}</p>
                        {deliveryPrice.payment ? <p className="mt-0.5 text-xs font-semibold" style={{ color: "#1D4ED8" }}>Pagamento: {deliveryPrice.payment}</p> : null}
                      </>
                    ) : (
                      <p className="mt-1 text-sm font-bold" style={{ color: deliveryPrice.kind === "free" ? "#166534" : "#1D4ED8" }}>{deliveryPrice.title}</p>
                    )}
                  </div>
                </div>
                {order.assignedDriverPhone ? (
                  <a
                    href={buildPhoneHref(order.assignedDriverPhone) ?? undefined}
                    className="inline-flex w-full justify-center rounded-2xl px-4 py-2.5 text-sm font-black text-white sm:w-auto"
                    style={{ background: RED }}
                  >
                    Ligar para o estafeta
                  </a>
                ) : null}
              </div>
              );
            })()}
          </div>
        )}

        {status === "AWAITING_DELIVERY_PAYMENT" && isInternalCod && !PAYMENT_BLOCKED_ORDER_STATUSES.has(String(order.status ?? "").toUpperCase()) && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#F5F3FF", borderColor: "#DDD6FE" }}>
            <h3 className="text-base font-black" style={{ color: "#5B21B6", fontFamily: "'Sora', sans-serif" }}>Pagamento da entrega pendente</h3>
            {order.deliveryCollectionMethod === "CASH_IN_HAND" ? (
              <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                O estafeta fará a cobrança em dinheiro no acto da entrega.
              </p>
            ) : order.deliveryCollectionMethod === "PAYSUITE" ? (
              <>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  O estafeta enviou um link de pagamento. Paga a taxa de entrega para receber a tua encomenda.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={order.activeDeliveryPaymentUrl ?? `/orders/${order.id}/payment?mode=paysuite&purpose=delivery`}
                    className="inline-flex rounded-2xl px-4 py-2.5 text-sm font-black text-white"
                    style={{ background: "#5B21B6" }}
                    onClick={() => void markOrderUpdatesSeen(order.id)}
                  >
                    Pagar taxa de entrega
                  </a>
                </div>
              </>
            ) : order.deliveryCollectionMethod === "MANUAL_TRANSFER" ? (
              <>
                <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                  Envia o comprovativo de transferência para a equipa financeira validar e receber a tua encomenda.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={`/orders/${order.id}/payment?mode=manual&purpose=delivery`}
                    className="inline-flex rounded-2xl border px-4 py-2.5 text-sm font-black"
                    style={{ borderColor: "#A78BFA", color: "#5B21B6" }}
                    onClick={() => void markOrderUpdatesSeen(order.id)}
                  >
                    Enviar comprovativo
                  </a>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm" style={{ color: "#5B21B6" }}>
                O estafeta está no local. Aguarda instrução de como proceder com o pagamento da entrega.
              </p>
            )}
          </div>
        )}

        {order.adminMessageForClient && (
          <div className="mt-5 rounded-[24px] border px-4 py-4" style={{ background: "#EFF6FF", borderColor: "#93C5FD" }}>
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "#1D4ED8" }}>Mensagem da ShopeeMz</p>
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
                        {step.failed ? "?" : step.done ? "?" : step.current ? "?" : "?"}
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
            {canShowPaymentAction(order) && <Link href={`/orders/${order.id}/payment`} onClick={() => void markOrderUpdatesSeen(order.id)} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>{order.status === "PAYMENT_REJECTED" ? "Tentar novamente" : "Continuar pagamento"}</Link>}
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
            <p className="mt-2 text-sm font-semibold" style={{ color: "#15803D" }}>
              Em breve também poderás acompanhar os teus pedidos pelo WhatsApp. Por agora, acompanha o estado na área Meus pedidos.
            </p>
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
          "Recebeste este pedido?"
        }
        message={
          confirmAction?.kind === "cancel"
            ? `O pedido ${orderDisplayCode(orders.find((order) => order.id === confirmAction.orderId))} sera marcado como recusado e a equipa sera informada.`
            : confirmAction?.kind === "cancel_order"
            ? "Esta acao nao pode ser desfeita. O pedido sera cancelado e a equipa sera informada."
            : `Confirma apenas se o pedido ${orderDisplayCode(orders.find((order) => order.id === confirmAction?.orderId))} ja foi entregue nas tuas maos. Depois disso vamos marcar esta entrega como recebida.`
        }
        confirmLabel={
          confirmAction?.kind === "cancel" || confirmAction?.kind === "cancel_order" ? "Cancelar pedido" : "Sim, recebi"
        }
        danger={confirmAction?.kind === "cancel" || confirmAction?.kind === "cancel_order"}
        pending={busyOrderId === confirmAction?.orderId}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.kind === "cancel" || confirmAction.kind === "cancel_order") {
            void handleCancel(confirmAction.orderId).finally(() => setConfirmAction(null));
            return;
          }
          void handleConfirmReceived(confirmAction.orderId);
        }}
      />
    </div>
  );
}
