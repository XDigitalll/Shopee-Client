"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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

// ── Return-flow state machine ────────────────────────────────────────────────
// idle       → normal page (no psr param, or confirmed previously)
// confirming → autonomous window after returning from PaySuite (0–90 s)
// confirmed  → payment confirmed; brief state before auto-redirect
// timed_out  → 90 s elapsed, still pending
type ReturnPhase = "idle" | "confirming" | "confirmed" | "timed_out";

const CONFIRMING_DURATION_MS = 90_000;
const CONFIRMING_POLL_MS = 3_000;     // poll order state every 3 s while confirming
const CONFIRMING_SYNC_EVERY_MS = 10_000; // query gateway once every 10 s while confirming
const IDLE_POLL_MS = 10_000;
const REDIRECT_DELAY_S = 3;

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
    PAYMENT_SUBMITTED: {
      title: "Pagamento em processamento",
      body: "O teu pagamento está a ser verificado. Esta página actualiza automaticamente.",
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
      body: "O pagamento foi confirmado pelo gateway e o pedido está em processamento.",
      color: "#166534", bg: "#F0FDF4", border: "#86EFAC",
    },
  };
  return map[status ?? ""] ?? {
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
      (payload as Record<string, string> | null)?.message ??
      (payload as Record<string, string> | null)?.error ??
      "Não foi possível carregar o pedido.",
    );
  }
  return payload as T;
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = "h-10 w-10" }: { size?: string }) {
  return (
    <svg
      className={`${size} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function OrderPaymentPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  const orderId = Number(params.id);

  // ── Order state ────────────────────────────────────────────────────────────
  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  // ── Return-flow state machine ──────────────────────────────────────────────
  const returningFromPaySuite = searchParams.get("psr") === "1";
  const [returnPhase, setReturnPhase] = useState<ReturnPhase>(
    returningFromPaySuite ? "confirming" : "idle",
  );
  const [redirectSecondsLeft, setRedirectSecondsLeft] = useState(REDIRECT_DELAY_S);

  // ── Payment form state (only used in idle phase) ───────────────────────────
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [timedOutNote, setTimedOutNote] = useState<string | null>(null);
  const paysuiteAction = useAsyncAction();
  const manualSyncAction = useAsyncAction();
  const [paysuiteMethod, setPaysuiteMethod] = useState<PaySuiteMethod>("MPESA");
  const [paysuitePayment, setPaysuitePayment] = useState<PaySuiteInitResponse | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const syncInFlightRef = useRef(false);       // mutex: prevent concurrent sync calls
  const lastSyncAtRef = useRef<number>(0);     // timestamp of last sync call
  const confirmingStartRef = useRef<number>(
    returningFromPaySuite ? Date.now() : 0,
  );

  // ── Load order ─────────────────────────────────────────────────────────────
  const loadOrder = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!token || !orderId) return;
    try {
      const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
      setAllOrders(orders);
      const current = orders.find((o) => o.id === orderId) ?? null;
      setOrder(current);
    } catch (err) {
      if (!silent) {
        setFeedback({
          type: "error",
          msg: err instanceof Error ? err.message : "Não foi possível carregar o pedido.",
        });
      }
    }
  }, [orderId, token]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // ── Background sync — invisible, mutex-protected ───────────────────────────
  const triggerBackgroundSync = useCallback(async () => {
    if (syncInFlightRef.current || !orderId) return;
    syncInFlightRef.current = true;
    lastSyncAtRef.current = Date.now();
    console.info("[PAYMENT_RETURN_SYNC_ATTEMPT]", { orderId });
    try {
      await apiFetch<PaySuiteInitResponse>(
        `orders/${orderId}/payment/paysuite/sync`,
        { method: "POST", body: "" },
      );
    } catch {
      // Swallow silently — polling will detect status changes via loadOrder
    } finally {
      syncInFlightRef.current = false;
    }
  }, [orderId]);

  // ── On psr=1 arrival: fire initial sync once ───────────────────────────────
  useEffect(() => {
    if (returningFromPaySuite) {
      console.info("[PAYMENT_RETURN_STARTED]", { orderId });
      void triggerBackgroundSync();
    }
    // Only run once on mount — intentional empty-ish deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Confirming-window polling loop ─────────────────────────────────────────
  useEffect(() => {
    if (!token || !orderId) return;
    if (returnPhase !== "confirming") return;

    const interval = setInterval(() => {
      void loadOrder({ silent: true });

      const elapsed = Date.now() - confirmingStartRef.current;
      if (elapsed >= CONFIRMING_DURATION_MS) {
        console.info("[PAYMENT_RETURN_TIMEOUT]", { orderId });
        setReturnPhase("timed_out");
        return;
      }

      // Periodic gateway sync every CONFIRMING_SYNC_EVERY_MS (separate from polling)
      if (Date.now() - lastSyncAtRef.current >= CONFIRMING_SYNC_EVERY_MS) {
        void triggerBackgroundSync();
      }
    }, CONFIRMING_POLL_MS);

    return () => clearInterval(interval);
  }, [loadOrder, orderId, token, returnPhase, triggerBackgroundSync]);

  // ── Idle polling loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !orderId) return;
    if (returnPhase === "confirming") return; // handled above

    const interval = setInterval(() => {
      void loadOrder({ silent: true });
    }, IDLE_POLL_MS);

    return () => clearInterval(interval);
  }, [loadOrder, orderId, token, returnPhase]);

  // ── Detect confirmation ────────────────────────────────────────────────────
  const isPaid = PAID_STATUSES.has(order?.status ?? "");

  useEffect(() => {
    if (!isPaid) return;
    if (returnPhase === "confirming" || returnPhase === "timed_out") {
      console.info("[PAYMENT_RETURN_CONFIRMED]", { orderId, status: order?.status });
      emitClientDataChanged();
      setReturnPhase("confirmed");
    }
  }, [isPaid, returnPhase, orderId, order?.status]);

  // ── Auto-redirect after confirmation ──────────────────────────────────────
  useEffect(() => {
    if (returnPhase !== "confirmed") return;
    setRedirectSecondsLeft(REDIRECT_DELAY_S);
    const countdown = setInterval(() => {
      setRedirectSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          router.replace("/orders");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [returnPhase, router]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const orderStatus = order?.status ?? "";
  const officialAmount = orderVisibleTotal(order);
  const visual = statusCopy(orderStatus, order?.adminMessageForClient);
  const isProcessing = orderStatus === "PAYMENT_SUBMITTED" || orderStatus === "PAYMENT_UNDER_REVIEW";
  const explicitFailure = orderStatus === "PAYMENT_REJECTED";
  // Payment form is shown only in idle mode, or after timeout with an explicit failure
  const canPay = (orderStatus === "PENDING_PAYMENT" || explicitFailure)
    && (returnPhase === "idle" || (returnPhase === "timed_out" && explicitFailure));

  const relatedOrders = (order?.purchaseGroupKey
    ? allOrders.filter((o) => o.purchaseGroupKey === order.purchaseGroupKey)
    : []);

  // ── Manual sync (timed_out "Verificar novamente") ─────────────────────────
  async function handleManualSync() {
    if (!order) return;
    setTimedOutNote(null);
    let capturedMsg: string | null = null;

    const ok = await manualSyncAction.run(async () => {
      try {
        const result = await apiFetch<PaySuiteInitResponse>(
          `orders/${order.id}/payment/paysuite/sync`,
          { method: "POST", body: "" },
        );
        if (result.status === "SUCCESS") {
          emitClientDataChanged();
          void loadOrder();
        } else {
          console.info("[PAYMENT_RETURN_STILL_PENDING]", { orderId });
          setTimedOutNote(
            "O pagamento ainda não foi confirmado pelo gateway. "
            + "Se o dinheiro já saiu da tua conta, não pagues novamente — vamos continuar a verificar.",
          );
        }
        return true;
      } catch (err) {
        capturedMsg = normalizeClientError(err, "Não foi possível verificar o estado.").message;
        throw err;
      }
    });

    if (!ok) {
      setTimedOutNote(capturedMsg ?? "Não foi possível verificar o estado do pagamento.");
    }
  }

  // ── Create payment ─────────────────────────────────────────────────────────
  async function handlePaySuitePayment() {
    if (!isAuthenticated || !token) {
      setFeedback({ type: "error", msg: "A tua sessão expirou. Entra novamente para pagar." });
      await expireStoredSession();
      router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
      return;
    }
    if (!order || !canPay) return;
    if (!officialAmount || officialAmount <= 0) {
      setFieldError("O valor oficial do pedido ainda não está disponível. Actualiza a página e tenta novamente.");
      return;
    }
    setFieldError(null);
    setFeedback(null);

    let capturedError: string | null = null;
    const ok = await paysuiteAction.run(async () => {
      try {
        const returnUrl = typeof window !== "undefined"
          ? `${window.location.origin}/orders/${order.id}/payment?psr=1`
          : undefined;
        const response = await apiFetch<PaySuiteInitResponse>(`orders/${order.id}/payment/paysuite`, {
          method: "POST",
          body: JSON.stringify({ method: paysuiteMethod, returnUrl }),
        });
        setPaysuitePayment(response);
        emitClientDataChanged();
        if (response.checkoutUrl) {
          window.location.assign(response.checkoutUrl);
        }
        return true;
      } catch (err) {
        capturedError = normalizeClientError(
          err,
          "Não foi possível iniciar o pagamento. Tenta novamente em alguns minutos.",
        ).message;
        throw err;
      }
    });

    if (!ok) {
      setFeedback({
        type: "error",
        msg: capturedError ?? "Não foi possível iniciar o pagamento. Tenta novamente em alguns minutos.",
      });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        {/* ── Header — always visible ── */}
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
              {returnPhase === "confirming"
                ? "A verificar automaticamente o estado do teu pagamento."
                : "Paga via M-Pesa, eMola ou cartão. A confirmação é automática quando o gateway processa o pagamento."}
            </p>
          </div>
          <div
            className="rounded-[24px] border px-5 py-4"
            style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
              Total
            </p>
            <p
              className="mt-2 text-3xl font-black"
              style={{ color: RED, fontFamily: "'Sora', sans-serif" }}
            >
              {formatMoney(officialAmount)}
            </p>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            PHASE: confirming (autonomous 0–90 s window — no interaction)
            ════════════════════════════════════════════════════════════════ */}
        {returnPhase === "confirming" ? (
          <div className="mt-8 flex flex-col items-center gap-5 py-8 text-center">
            <span style={{ color: GREEN }}>
              <Spinner size="h-12 w-12" />
            </span>
            <div className="max-w-sm">
              <p
                className="text-lg font-black"
                style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}
              >
                Estamos a confirmar o teu pagamento
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: "#6B7280" }}>
                Este processo pode levar alguns segundos.{" "}
                <strong style={{ color: "#374151" }}>Não feches esta página.</strong>
              </p>
            </div>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Se o dinheiro já saiu da tua conta, a confirmação chega automaticamente.
            </p>
          </div>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════════
            PHASE: confirmed — brief success before redirect
            ════════════════════════════════════════════════════════════════ */}
        {returnPhase === "confirmed" ? (
          <div
            className="mt-8 rounded-[24px] border p-8 text-center"
            style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}
          >
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "#DCFCE7" }}
            >
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.5}>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <p
              className="mt-4 text-xl font-black"
              style={{ color: "#166534", fontFamily: "'Sora', sans-serif" }}
            >
              Pagamento confirmado
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "#4B5563" }}>
              Recebemos o teu pagamento. O teu pedido já está em processamento.
            </p>
            <p className="mt-3 text-sm" style={{ color: "#6B7280" }}>
              A redirecionar em {redirectSecondsLeft}s…
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

        {/* ════════════════════════════════════════════════════════════════════
            PHASE: timed_out — pending after 90 s, no explicit failure
            ════════════════════════════════════════════════════════════════ */}
        {returnPhase === "timed_out" && !isPaid && !explicitFailure ? (
          <div className="mt-6 space-y-4">
            <div
              className="rounded-[22px] border px-5 py-5"
              style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}
            >
              <p className="text-sm font-black" style={{ color: "#92400E" }}>
                Pagamento ainda em confirmação
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: "#78350F" }}>
                Se o dinheiro já saiu da tua conta,{" "}
                <strong>não pagues novamente.</strong>{" "}
                O sistema continua a verificar automaticamente. Podes verificar o estado abaixo ou aguardar.
              </p>
              {timedOutNote ? (
                <p className="mt-3 text-sm" style={{ color: "#92400E" }}>
                  {timedOutNote}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleManualSync()}
                disabled={manualSyncAction.isRunning}
                className="flex-1 rounded-2xl px-5 py-3 text-sm font-black"
                style={{
                  background: manualSyncAction.isRunning ? "#E5E7EB" : "#FDE68A",
                  color: manualSyncAction.isRunning ? "#9CA3AF" : "#92400E",
                  border: "1px solid #FCD34D",
                }}
              >
                {manualSyncAction.isRunning ? "A verificar…" : "Verificar novamente"}
              </button>
              <Link
                href="/orders"
                className="flex-1 rounded-2xl border px-5 py-3 text-center text-sm font-black"
                style={{ borderColor: "#D1D5DB", color: "#374151" }}
              >
                Voltar aos meus pedidos
              </Link>
            </div>
          </div>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════════
            PHASE: idle (normal flow) — OR timed_out + explicit failure
            ════════════════════════════════════════════════════════════════ */}
        {returnPhase === "idle" || (returnPhase === "timed_out" && (explicitFailure || isPaid)) ? (
          <>
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

            {/* Paid success */}
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

            {/* Processing — legacy manual payment states */}
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

            {/* Verify hint (idle only, not during timed_out where we have a dedicated section) */}
            {canPay && returnPhase === "idle" ? (
              <div
                className="mt-4 rounded-2xl border px-4 py-3"
                style={{ borderColor: "#E5E7EB", background: "#F9FAFB" }}
              >
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  Já pagaste via PaySuite mas o pedido ainda aparece como pendente?
                </p>
                <button
                  type="button"
                  onClick={() => void handleManualSync()}
                  disabled={manualSyncAction.isRunning}
                  className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{
                    background: manualSyncAction.isRunning ? "#E5E7EB" : "#F3F4F6",
                    color: manualSyncAction.isRunning ? "#9CA3AF" : "#374151",
                    border: "1px solid #D1D5DB",
                  }}
                >
                  {manualSyncAction.isRunning ? "A verificar estado…" : "Verificar estado do pagamento"}
                </button>
              </div>
            ) : null}

            {/* Payment method selector + pay button */}
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
                        {explicitFailure ? "Tentar novamente com outro método" : "Escolhe o método de pagamento"}
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
                          disabled={paysuiteAction.isRunning}
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
                    disabled={paysuiteAction.isRunning || !officialAmount || officialAmount <= 0}
                    className="w-full rounded-2xl px-5 py-4 text-base font-black text-white"
                    style={{
                      background:
                        paysuiteAction.isRunning || !officialAmount || officialAmount <= 0
                          ? "#9CA3AF"
                          : GREEN,
                    }}
                  >
                    {paysuiteAction.isRunning
                      ? "A iniciar pagamento..."
                      : `Pagar ${formatMoney(officialAmount)} agora`}
                  </button>
                  <ClientActionFeedback
                    feedback={feedback}
                    onClose={() => setFeedback(null)}
                    actionLabel={
                      feedback?.type === "error" && /sessão expirada/i.test(feedback.msg ?? "")
                        ? "Entrar novamente"
                        : undefined
                    }
                    actionHref={
                      feedback?.type === "error" && /sessão expirada/i.test(feedback.msg ?? "")
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
                    disabled={paysuiteAction.isRunning || !officialAmount || officialAmount <= 0}
                    className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white"
                    style={{
                      background:
                        paysuiteAction.isRunning || !officialAmount || officialAmount <= 0
                          ? "#9CA3AF"
                          : GREEN,
                    }}
                  >
                    {paysuiteAction.isRunning ? "A iniciar..." : "Pagar agora"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
