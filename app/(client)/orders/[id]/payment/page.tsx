"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { apiFetch, emitClientDataChanged } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import { cleanDisplayText } from "@/lib/text";
import { normalizeClientError } from "@/lib/client-errors";
import type { Order } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ClientActionFeedback } from "@/components/client-feedback-state";
import { RelatedPurchasePanel } from "@/components/orders/related-purchase-panel";
import { expireStoredSession } from "@/lib/auth";

const RED = "#E8431A";
const GREEN = "#2E8B57";

type PaySuiteMethod = "MPESA" | "EMOLA" | "CARD";
type Feedback = { type: "success" | "error"; msg: string } | null;
type PaySuiteInitResponse = {
  paymentId?: number;
  orderId?: number;
  expectedAmount?: number;
  currency?: string;
  provider?: string;
  providerReference?: string;
  paymentReference?: string;
  checkoutUrl?: string;
  status?: string;
  providerStatus?: string;
};

const PAYSUITE_METHODS: Array<{ key: PaySuiteMethod; label: string; icon: string; hint: string }> = [
  { key: "MPESA", label: "M-Pesa", icon: "M", hint: "Pagamento instantâneo" },
  { key: "EMOLA", label: "eMola", icon: "E", hint: "Carteira digital" },
  { key: "CARD", label: "Cartão", icon: "C", hint: "Visa / Mastercard" },
];

const PAID_STATUSES = new Set([
  "PAID", "READY_FOR_FULFILLMENT", "PICKING", "PREPARING", "READY_FOR_DELIVERY",
  "TO_PURCHASE", "ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED",
]);

function statusCopy(status?: string, adminMessage?: string) {
  const map: Record<string, { title: string; body: string; color: string; bg: string; border: string }> = {
    PENDING_PAYMENT: {
      title: "Pagamento pendente",
      body: "Escolhe o método e clica em Pagar agora. A confirmação é automática quando o gateway processa o pagamento.",
      color: "#9A3412", bg: "#FFF7ED", border: "#FED7AA",
    },
    // backward compat — pedidos que passaram pelo fluxo manual anterior
    PAYMENT_SUBMITTED: {
      title: "Pagamento em processamento",
      body: "O teu pagamento está a ser processado. Esta página actualiza automaticamente quando receber confirmação.",
      color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE",
    },
    PAYMENT_UNDER_REVIEW: {
      title: "Pagamento em verificação",
      body: "O pagamento está a ser verificado. Receberás uma notificação assim que estiver confirmado.",
      color: "#5B21B6", bg: "#F5F3FF", border: "#DDD6FE",
    },
    PAYMENT_REJECTED: {
      title: "Pagamento não confirmado",
      body: cleanDisplayText(adminMessage) || "O pagamento não foi processado. Escolhe o método e tenta novamente.",
      color: "#991B1B", bg: "#FFF5F5", border: "#FECACA",
    },
    PAID: {
      title: "Pagamento confirmado",
      body: "O pagamento foi confirmado pelo gateway e o pedido está a avançar para a próxima etapa.",
      color: "#166534", bg: "#F0FDF4", border: "#86EFAC",
    },
  };
  return map[status || ""] || {
    title: "Pagamento",
    body: "Acompanha aqui o estado do pagamento deste pedido.",
    color: "#4B5563", bg: "#F9FAFB", border: "#E5E7EB",
  };
}

async function fetchWithToken<T>(url: string, _token: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (payload as Record<string, string> | null)?.message ||
      (payload as Record<string, string> | null)?.error ||
      "Não foi possível carregar o pedido.",
    );
  }
  return payload as T;
}

export default function OrderPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const paysuiteAction = useAsyncAction();
  const isPaySuiteBusy = paysuiteAction.isRunning;
  const [paysuiteMethod, setPaysuiteMethod] = useState<PaySuiteMethod>("MPESA");
  const [paysuitePayment, setPaysuitePayment] = useState<PaySuiteInitResponse | null>(null);

  const loadOrder = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!token || !orderId) return;
    try {
      const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
      setAllOrders(orders);
      const currentOrder = orders.find((item) => item.id === orderId) || null;
      setOrder(currentOrder);
    } catch (error) {
      if (!silent) {
        setFeedback({
          type: "error",
          msg: error instanceof Error ? error.message : "Não foi possível carregar o pedido.",
        });
      }
    }
  }, [orderId, token]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // Poll every 10 s while waiting for the PaySuite webhook to fire.
  useEffect(() => {
    if (!token || !orderId) return;
    const interval = window.setInterval(() => { void loadOrder({ silent: true }); }, 10_000);
    return () => window.clearInterval(interval);
  }, [loadOrder, orderId, token]);

  const relatedOrders = useMemo(
    () => (order?.purchaseGroupKey
      ? allOrders.filter((item) => item.purchaseGroupKey === order.purchaseGroupKey)
      : []),
    [allOrders, order],
  );

  const officialAmount = orderVisibleTotal(order);
  const orderStatus = order?.status || "";
  const visual = statusCopy(orderStatus, order?.adminMessageForClient);
  const isPaid = PAID_STATUSES.has(orderStatus);
  const isProcessing = orderStatus === "PAYMENT_SUBMITTED" || orderStatus === "PAYMENT_UNDER_REVIEW";
  const canPay = orderStatus === "PENDING_PAYMENT" || orderStatus === "PAYMENT_REJECTED";

  async function handlePaySuitePayment() {
    if (!isAuthenticated || !token) {
      setFeedback({ type: "error", msg: "A tua sessão expirou. Entra novamente para pagar." });
      await expireStoredSession();
      router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
      return;
    }
    if (!order) return;
    if (!officialAmount || officialAmount <= 0) {
      setFieldError("O valor oficial do pedido ainda não está disponível. Actualiza a página e tenta novamente.");
      return;
    }

    setFieldError(null);
    setFeedback(null);

    // Capture the error synchronously inside the run callback — paysuiteAction.error
    // is React state and will be stale (still "") when read immediately after await.
    let capturedErrorMsg: string | null = null;

    const result = await paysuiteAction.run(async () => {
      try {
        const response = await apiFetch<PaySuiteInitResponse>(`orders/${order.id}/payment/paysuite`, {
          method: "POST",
          body: JSON.stringify({
            method: paysuiteMethod,
            returnUrl: typeof window !== "undefined"
              ? `${window.location.origin}/orders/${order.id}/payment`
              : undefined,
          }),
        });
        setPaysuitePayment(response);
        emitClientDataChanged();
        setFeedback({
          type: "success",
          msg: "Pagamento iniciado. Serás redireccionado para o checkout PaySuite.",
        });
        if (response.checkoutUrl) {
          window.location.assign(response.checkoutUrl);
        }
        return true;
      } catch (err) {
        capturedErrorMsg = normalizeClientError(
          err,
          "Não foi possível iniciar o pagamento. Tenta novamente em alguns minutos.",
        ).message;
        throw err;
      }
    });

    if (!result) {
      setFeedback({
        type: "error",
        msg: capturedErrorMsg ?? "Não foi possível iniciar o pagamento. Tenta novamente em alguns minutos.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 md:pb-0">
      <Link
        href="/orders"
        className="inline-flex rounded-full border px-4 py-2 text-sm font-bold"
        style={{ borderColor: "#F2D4CC", color: RED }}
      >
        Voltar aos pedidos
      </Link>

      <RelatedPurchasePanel currentOrder={order} relatedOrders={relatedOrders} />

      <section
        className="rounded-[28px] border bg-white p-5 shadow-sm sm:p-6"
        style={{ borderColor: "#F2D4CC" }}
      >
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Pagamento do pedido</p>
            <h1
              className="mt-1 text-3xl font-black"
              style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}
            >
              Pedido {orderDisplayCode(order ?? { id: orderId })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "#6B7280" }}>
              Paga via M-Pesa, eMola ou cartão. A confirmação é automática quando o gateway processa o pagamento.
            </p>
          </div>
          <div
            className="rounded-[24px] border px-5 py-4"
            style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
              Total a pagar
            </p>
            <p
              className="mt-2 text-3xl font-black"
              style={{ color: RED, fontFamily: "'Sora', sans-serif" }}
            >
              {formatMoney(officialAmount)}
            </p>
          </div>
        </div>

        {/* Status banner */}
        <div
          className="mt-5 rounded-[22px] border px-4 py-4"
          style={{ background: visual.bg, borderColor: visual.border, color: visual.color }}
        >
          <p className="text-sm font-black">{visual.title}</p>
          <p className="mt-1 text-sm leading-6">{visual.body}</p>
        </div>

        {/* Feedback */}
        {feedback ? (
          <div
            className="mt-4 rounded-2xl border px-4 py-3 text-sm"
            style={
              feedback.type === "success"
                ? { background: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" }
                : { background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }
            }
          >
            {feedback.msg}
          </div>
        ) : null}

        {/* PAID — terminal success state */}
        {isPaid ? (
          <div
            className="mt-6 rounded-[24px] border p-6 text-center"
            style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}
          >
            <p className="text-xl font-black" style={{ color: "#166534" }}>
              Pedido pago com sucesso
            </p>
            <p className="mt-2 text-sm" style={{ color: "#4B5563" }}>
              O teu pedido foi confirmado e está a ser processado.
            </p>
            <Link
              href="/orders"
              className="mt-5 inline-flex rounded-2xl px-6 py-3 text-sm font-black text-white"
              style={{ background: GREEN }}
            >
              Ver os meus pedidos
            </Link>
          </div>
        ) : null}

        {/* Processing — webhook fired, waiting for final status */}
        {isProcessing ? (
          <div
            className="mt-6 rounded-[24px] border p-5"
            style={{ borderColor: "#BFDBFE", background: "#EFF6FF" }}
          >
            <p className="text-sm font-semibold" style={{ color: "#1D4ED8" }}>
              A aguardar confirmação automática do pagamento. Esta página actualiza a cada 10 segundos.
            </p>
          </div>
        ) : null}

        {/* CAN PAY — show PaySuite method selector */}
        {canPay ? (
          <div className="mt-6 space-y-5">
            <div
              className="rounded-[24px] border p-5"
              style={{ borderColor: "#C7E7D3", background: "#F7FCF9" }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p
                    className="text-sm font-black"
                    style={{ color: "#14532D", fontFamily: "'Sora', sans-serif" }}
                  >
                    Escolhe o método de pagamento
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "#4B5563" }}>
                    A confirmação é automática após o gateway processar o pagamento.
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-black"
                  style={{ background: "#DCFCE7", color: "#166534" }}
                >
                  Seguro
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {PAYSUITE_METHODS.map((item) => {
                  const active = paysuiteMethod === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setPaysuiteMethod(item.key)}
                      disabled={isPaySuiteBusy}
                      className="rounded-[22px] border p-4 text-left transition"
                      style={{
                        borderColor: active ? GREEN : "#C7E7D3",
                        background: active ? "#ECFDF5" : "#FFFFFF",
                      }}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black text-white"
                        style={{ background: active ? GREEN : "#9CA3AF" }}
                      >
                        {item.icon}
                      </span>
                      <span className="mt-3 block text-sm font-black" style={{ color: "#1A1410" }}>
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs" style={{ color: "#6B7280" }}>
                        {item.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {paysuitePayment?.providerReference ? (
                <div
                  className="mt-4 rounded-2xl border px-4 py-3 text-sm"
                  style={{ borderColor: "#BBF7D0", background: "#F0FDF4", color: "#166534" }}
                >
                  Referência PaySuite: <strong>{paysuitePayment.providerReference}</strong>
                </div>
              ) : null}

              {fieldError ? (
                <div
                  className="mt-3 rounded-2xl border px-4 py-3 text-sm"
                  style={{ background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}
                >
                  {fieldError}
                </div>
              ) : null}
            </div>

            {/* Pay button — desktop */}
            <div className="hidden md:block">
              <button
                type="button"
                onClick={() => void handlePaySuitePayment()}
                disabled={isPaySuiteBusy || !officialAmount || officialAmount <= 0}
                className="w-full rounded-2xl px-5 py-4 text-base font-black text-white"
                style={{
                  background:
                    isPaySuiteBusy || !officialAmount || officialAmount <= 0
                      ? "#9CA3AF"
                      : GREEN,
                }}
              >
                {isPaySuiteBusy
                  ? "A iniciar pagamento..."
                  : `Pagar ${formatMoney(officialAmount)} agora`}
              </button>
              <ClientActionFeedback
                feedback={feedback}
                onClose={() => setFeedback(null)}
                actionLabel={
                  feedback?.type === "error" && /sessão expirada/i.test(feedback.msg)
                    ? "Entrar novamente"
                    : undefined
                }
                actionHref={
                  feedback?.type === "error" && /sessão expirada/i.test(feedback.msg)
                    ? `/login?redirect=%2Forders%2F${orderId}%2Fpayment`
                    : undefined
                }
              />
            </div>

            {/* Pay button — mobile sticky */}
            <div
              className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
              style={{ borderColor: "#F2D4CC" }}
            >
              <button
                type="button"
                onClick={() => void handlePaySuitePayment()}
                disabled={isPaySuiteBusy || !officialAmount || officialAmount <= 0}
                className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white"
                style={{
                  background:
                    isPaySuiteBusy || !officialAmount || officialAmount <= 0
                      ? "#9CA3AF"
                      : GREEN,
                }}
              >
                {isPaySuiteBusy ? "A iniciar..." : "Pagar agora"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
