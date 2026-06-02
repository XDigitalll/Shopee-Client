"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PAYMENT_SUPPORT_MESSAGE, SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL } from "@/lib/support-contacts";

const RED = "#E8431A";
const GREEN = "#2E8B57";
const AMBER = "#D97706";

function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[payment]", ...args);
  }
}

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
  syncStatus?: string;
  financialEvidence?: boolean;
  canRetry?: boolean;
  retryReason?: string;
};

// idle       — normal page access (no ?psr=1)
// confirming — 0–90 s autonomous window after returning from PaySuite (zero buttons)
// confirmed  — payment detected as paid; show success + auto-redirect
// timed_out  — 90 s elapsed without confirmation; show calm message + manual verify only
type ReturnPhase = "idle" | "confirming" | "confirmed" | "timed_out";

const PAYSUITE_METHODS: Array<{ key: PaySuiteMethod; label: string; icon: string; hint: string }> = [
  { key: "MPESA", label: "M-Pesa", icon: "M", hint: "Pagamento instantâneo" },
  { key: "EMOLA", label: "eMola", icon: "E", hint: "Carteira digital" },
  { key: "CARD", label: "Cartão", icon: "C", hint: "Visa / Mastercard" },
];

const PAID_STATUSES = new Set([
  "PAID", "READY_FOR_FULFILLMENT", "PICKING", "PREPARING", "READY_FOR_DELIVERY",
  "TO_PURCHASE", "ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED",
]);

// Active PaySuite statuses — block creating a second payment while one exists.
const ACTIVE_PAYSUITE_STATUSES = new Set(["PENDING", "PROCESSING", "WAITING"]);

// Terminal statuses where no money will arrive — unblocks a new payment attempt.
const TERMINAL_PAYMENT_STATUSES = new Set(["FAILED", "CANCELLED", "AMOUNT_MISMATCH", "LATE_PAYMENT"]);

const RETURNING_POLL_DURATION_MS = 90_000;
const RETURNING_POLL_INTERVAL_MS = 3_000;
const IDLE_POLL_INTERVAL_MS = 10_000;
const CONFIRMED_REDIRECT_DELAY_MS = 3_000;

// Classify the gateway status string returned by the sync endpoint.
export function classifySyncResult(status?: string): "confirmed" | "pending" | "failed" {
  const s = (status ?? "").toLowerCase();
  if (["success", "completed", "paid", "confirmed"].includes(s)) return "confirmed";
  // amount_mismatch / late_payment: money may have arrived but payment cannot proceed —
  // treated as failed so the customer is unblocked to try again or contact support.
  if (["failed", "cancelled", "canceled", "expired", "rejected", "amount_mismatch", "late_payment"].includes(s)) return "failed";
  return "pending";
}

// True when there is already an active PaySuite transaction for this order.
export function isActivePaySuitePayment(p: PaySuiteInitResponse | null): boolean {
  if (!p) return false;
  if (p.canRetry && !p.financialEvidence) return false;
  const s = (p.status ?? "").toUpperCase();
  return ACTIVE_PAYSUITE_STATUSES.has(s) && !!(p.providerReference || p.checkoutUrl);
}

// True when creating a new payment must be blocked.
export function shouldBlockDuplicatePayment(p: PaySuiteInitResponse | null): boolean {
  return isActivePaySuitePayment(p);
}

function statusCopy(status?: string, adminMessage?: string) {
  const map: Record<string, { title: string; body: string; color: string; bg: string; border: string }> = {
    PENDING_PAYMENT: {
      title: "Pagamento pendente",
      body: "Escolhe o método e clica em Pagar agora. A confirmação é automática quando o gateway processa o pagamento.",
      color: "#9A3412", bg: "#FFF7ED", border: "#FED7AA",
    },
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token, isAuthenticated, user } = useAuth();
  const orderId = Number(params.id);

  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const paysuiteAction = useAsyncAction();
  const [paysuiteMethod, setPaysuiteMethod] = useState<PaySuiteMethod>("MPESA");
  const [paysuitePayment, setPaysuitePayment] = useState<PaySuiteInitResponse | null>(null);

  // Mutex: prevents parallel sync calls regardless of UI state.
  const syncInFlightRef = useRef(false);
  // Guard: ensures [PAYMENT_RETURN_CONFIRMED] logs exactly once per page mount.
  const confirmedLoggedRef = useRef(false);
  const [isSyncBusy, setIsSyncBusy] = useState(false);

  const returningFromPaySuite = searchParams.get("psr") === "1";
  const [returnPhase, setReturnPhase] = useState<ReturnPhase>(
    returningFromPaySuite ? "confirming" : "idle",
  );
  const confirmingStartRef = useRef<number>(returningFromPaySuite ? Date.now() : 0);
  const [confirmingElapsed, setConfirmingElapsed] = useState(0);
  const [redirectCountdown, setRedirectCountdown] = useState(CONFIRMED_REDIRECT_DELAY_MS / 1000);

  const isPaySuiteBusy = paysuiteAction.isRunning;

  const loadOrder = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!token || !orderId) return;
    try {
      const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
      setAllOrders(orders);
      const currentOrder = orders.find((item) => item.id === orderId) || null;
      setOrder(currentOrder);

      // Keep paysuitePayment in sync with what the backend reports.
      // This ensures hasActivePaySuitePayment and syncConfirmedFailure are accurate
      // on fresh page load and after every background poll — not just after a
      // manual "Pagar agora" click (which is the only other place setPaysuitePayment runs).
      if (currentOrder?.payment?.provider?.toUpperCase() === "PAYSUITE") {
        setPaysuitePayment({
          status: currentOrder.payment.status,
          providerReference: currentOrder.payment.providerReference,
          checkoutUrl: currentOrder.payment.checkoutUrl,
          providerStatus: currentOrder.payment.providerStatus,
          expectedAmount: currentOrder.payment.expectedAmount,
          canRetry: false,
        });
      }

      if (currentOrder && PAID_STATUSES.has(currentOrder.status)) {
        setReturnPhase("confirmed");
        if (!confirmedLoggedRef.current) {
          confirmedLoggedRef.current = true;
          devLog("[PAYMENT_RETURN_CONFIRMED]", { orderId, status: currentOrder.status });
        }
      }
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

  // Adaptive polling — fast during confirming, slow otherwise.
  useEffect(() => {
    if (!token || !orderId || returnPhase === "confirmed") return;
    const intervalMs = returnPhase === "confirming" ? RETURNING_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
    const interval = window.setInterval(() => { void loadOrder({ silent: true }); }, intervalMs);
    return () => window.clearInterval(interval);
  }, [loadOrder, orderId, token, returnPhase]);

  // Confirming window: countdown ticker + timeout transition.
  useEffect(() => {
    if (returnPhase !== "confirming") return;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - confirmingStartRef.current;
      setConfirmingElapsed(elapsed);
      if (elapsed >= RETURNING_POLL_DURATION_MS) {
        setReturnPhase("timed_out");
        devLog("[PAYMENT_RETURN_TIMEOUT]", { orderId });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [orderId, returnPhase]);

  // One automatic sync attempt 2 s after entering confirming phase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!returningFromPaySuite || !token || !orderId) return;
    devLog("[PAYMENT_RETURN_STARTED]", { orderId });
    const timeout = window.setTimeout(() => { void performSync({ auto: true }); }, 2000);
    return () => window.clearTimeout(timeout);
  // Intentionally runs once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect countdown after confirmed phase.
  useEffect(() => {
    if (returnPhase !== "confirmed") return;
    const interval = window.setInterval(() => {
      setRedirectCountdown((c) => {
        if (c <= 1) { router.push("/orders"); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [returnPhase, router]);

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
  const hasActivePaySuitePayment = isActivePaySuitePayment(paysuitePayment);
  const verificationOk =
    user?.authProvider === "GOOGLE" ||
    user?.provider === "GOOGLE" ||
    user?.emailVerified === true ||
    user?.phoneVerified === true;
  const lastSyncNoFinancialEvidence = !!paysuitePayment
    && paysuitePayment.financialEvidence !== true
    && (paysuitePayment.syncStatus === "NO_FINANCIAL_EVIDENCE" || paysuitePayment.syncStatus === "SYNC_NO_RESPONSE");
  const canGenerateRetry = orderStatus === "PENDING_PAYMENT"
    && !isPaid
    && !!paysuitePayment?.canRetry
    && lastSyncNoFinancialEvidence;
  const needsVerificationForPayment = (orderStatus === "PENDING_PAYMENT" || orderStatus === "PAYMENT_REJECTED")
    && !verificationOk
    && !hasActivePaySuitePayment
    && returnPhase === "idle";

  // Payment form is shown only in idle phase with no active PaySuite transaction.
  const canPay = (orderStatus === "PENDING_PAYMENT" || orderStatus === "PAYMENT_REJECTED")
    && verificationOk
    && !hasActivePaySuitePayment
    && !canGenerateRetry
    && returnPhase === "idle";

  // Allow retry in timed_out when:
  // (a) backend reported PAYMENT_REJECTED — explicit server-side failure, OR
  // (b) the last sync (or background poll) confirmed a terminal payment status
  //     from the gateway: FAILED, CANCELLED, AMOUNT_MISMATCH, LATE_PAYMENT.
  //     The order may still be PENDING_PAYMENT but no money is coming — retry is safe.
  const explicitFailure = orderStatus === "PAYMENT_REJECTED";
  const syncConfirmedFailure = TERMINAL_PAYMENT_STATUSES.has(
    (paysuitePayment?.status ?? "").toUpperCase(),
  );
  const canRetryAfterTimeout = returnPhase === "timed_out"
    && verificationOk
    && (explicitFailure || syncConfirmedFailure)
    && !hasActivePaySuitePayment;

  async function performSync({ auto = false }: { auto?: boolean } = {}) {
    if (syncInFlightRef.current) return; // mutex — blocks parallel calls
    syncInFlightRef.current = true;
    setIsSyncBusy(true);

    const targetId = order?.id ?? orderId;
    if (auto) {
      devLog("[PAYMENT_RETURN_SYNC_ATTEMPT]", { orderId: targetId });
    } else {
      devLog("[PAYMENT_SYNC_STARTED]", { orderId: targetId, manual: true });
    }

    try {
      const syncResult = await apiFetch<PaySuiteInitResponse>(
        `orders/${targetId}/payment/paysuite/sync`,
        { method: "POST", body: "" },
      );
      const outcome = classifySyncResult(syncResult.status);

      if (outcome === "confirmed") {
        emitClientDataChanged();
        await loadOrder();
        setReturnPhase("confirmed");
        setFeedback({ type: "success", msg: "Pagamento confirmado. O teu pedido foi actualizado." });
        devLog("[PAYMENT_SYNC_CONFIRMED]", { orderId: targetId, status: syncResult.status });
      } else if (outcome === "failed") {
        // Persist the sync response so syncConfirmedFailure becomes true immediately,
        // unblocking canRetryAfterTimeout without waiting for the next background poll.
        setPaysuitePayment(syncResult);
        // Use functional updater — performSync may be a stale closure (empty-deps auto-sync effect).
        setReturnPhase(prev => prev === "confirming" ? "timed_out" : prev);
        if (!auto) {
          setFeedback({ type: "error", msg: "Este pagamento não foi concluído. Podes tentar novamente." });
        }
        devLog("[PAYMENT_SYNC_FAILED]", { orderId: targetId, status: syncResult.status });
      } else {
        // Persist pending sync result so hasActivePaySuitePayment reflects the latest
        // gateway state (e.g. keeps blocking a duplicate payment attempt).
        setPaysuitePayment(syncResult);
        if (!auto) {
          setFeedback({
            type: "error",
            msg: "Ainda estamos a confirmar o pagamento junto da PaySuite. Se o dinheiro já saiu da tua conta, não efetues novo pagamento.",
          });
        }
        devLog("[PAYMENT_SYNC_PENDING]", { orderId: targetId, status: syncResult.status });
      }
    } catch (err) {
      const msg = normalizeClientError(err, "Não foi possível verificar o estado do pagamento.").message;
      if (!auto) setFeedback({ type: "error", msg });
    } finally {
      syncInFlightRef.current = false;
      setIsSyncBusy(false);
    }
  }

  async function handlePaySuitePayment() {
    if (!isAuthenticated || !token) {
      setFeedback({ type: "error", msg: "A tua sessão expirou. Entra novamente para pagar." });
      await expireStoredSession();
      router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
      return;
    }
    if (!order) return;
    if (!verificationOk) {
      setFeedback({ type: "error", msg: "Verifica o teu email ou telefone antes de confirmar pagamentos." });
      router.push("/profile");
      return;
    }
    if (!officialAmount || officialAmount <= 0) {
      setFieldError("O valor oficial do pedido ainda não está disponível. Actualiza a página e tenta novamente.");
      return;
    }
    if (shouldBlockDuplicatePayment(paysuitePayment)) {
      setFeedback({ type: "error", msg: "Já existe uma tentativa de pagamento em curso. Aguarda a confirmação." });
      devLog("[PAYMENT_DUPLICATE_ATTEMPT_BLOCKED]", { orderId });
      return;
    }

    setFieldError(null);
    setFeedback(null);

    let capturedErrorMsg: string | null = null;

    const result = await paysuiteAction.run(async () => {
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

  async function handlePaySuiteRetry() {
    if (!isAuthenticated || !token) {
      setFeedback({ type: "error", msg: "A tua sessao expirou. Entra novamente para pagar." });
      await expireStoredSession();
      router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
      return;
    }
    if (!order || !canGenerateRetry) return;
    if (!verificationOk) {
      setFeedback({ type: "error", msg: "Verifica o teu email ou telefone antes de confirmar pagamentos." });
      router.push("/profile");
      return;
    }

    const result = await paysuiteAction.run(async () => {
      const returnUrl = typeof window !== "undefined"
        ? `${window.location.origin}/orders/${order.id}/payment?psr=1`
        : undefined;
      const response = await apiFetch<PaySuiteInitResponse>(`orders/${order.id}/payment/paysuite/retry`, {
        method: "POST",
        body: JSON.stringify({ method: paysuiteMethod, returnUrl }),
      });
      setPaysuitePayment(response);
      emitClientDataChanged();
      setFeedback({
        type: "success",
        msg: "Nova tentativa criada. Vais ser redireccionado para um checkout PaySuite novo.",
      });
      if (response.checkoutUrl) {
        window.location.assign(response.checkoutUrl);
      }
      return true;
    });

    if (!result) {
      setFeedback({
        type: "error",
        msg: "Nao foi possivel gerar uma nova tentativa. Se o valor saiu da tua conta, nao pagues novamente; fala com o suporte.",
      });
    }
  }

  const confirmingSecondsLeft = Math.max(
    0,
    Math.ceil((RETURNING_POLL_DURATION_MS - confirmingElapsed) / 1000),
  );

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
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6" style={{ color: "#15803D" }}>
              Também poderás acompanhar este pedido pelo WhatsApp. Usa o mesmo número da tua conta para consultar pedidos no WhatsApp.
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

        {/* ── CONFIRMING (0–90 s): spinner only, zero buttons ── */}
        {returnPhase === "confirming" ? (
          <div
            className="mt-6 rounded-[24px] border p-6 text-center"
            style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}
          >
            <svg
              className="mx-auto mb-4 h-10 w-10 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke={AMBER}
              strokeWidth={2}
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p className="text-xl font-black" style={{ color: "#92400E" }}>
              A confirmar pagamento
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "#78350F" }}>
              Ainda estamos a confirmar o pagamento junto da PaySuite.
              <br />
              Não feches esta página.
            </p>
            {confirmingSecondsLeft > 0 && (
              <p className="mt-3 text-xs" style={{ color: "#B45309" }}>
                A verificar automaticamente… ({confirmingSecondsLeft}s restantes)
              </p>
            )}
          </div>
        ) : null}

        {/* ── CONFIRMED: success screen + auto-redirect countdown ── */}
        {returnPhase === "confirmed" ? (
          <div
            className="mt-6 rounded-[24px] border p-6 text-center"
            style={{ borderColor: "#86EFAC", background: "#F0FDF4" }}
          >
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "#DCFCE7" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.5} className="h-8 w-8">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-xl font-black" style={{ color: "#166534" }}>
              Pagamento confirmado
            </p>
            <p className="mt-2 text-sm" style={{ color: "#4B5563" }}>
              O teu pagamento foi recebido com sucesso. O pedido já está em processamento.
            </p>
            <p className="mt-3 text-xs" style={{ color: "#6B7280" }}>
              A redirecionar para os teus pedidos em {redirectCountdown}s…
            </p>
            <Link
              href="/orders"
              className="mt-5 inline-flex rounded-2xl px-6 py-3 text-sm font-black text-white"
              style={{ background: GREEN }}
            >
              Ver os meus pedidos agora
            </Link>
          </div>
        ) : null}

        {/* ── TIMED-OUT: calm message + manual verify only, no pay button ── */}
        {returnPhase === "timed_out" ? (
          <div
            className="mt-6 rounded-[24px] border p-5"
            style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}
          >
            <p className="text-sm font-black" style={{ color: "#92400E" }}>
              Ainda estamos a confirmar o pagamento junto da PaySuite
            </p>
            <p className="mt-2 text-sm leading-6" style={{ color: "#78350F" }}>
              Se o dinheiro já saiu da tua conta, não pagues novamente.
              A confirmação é feita exclusivamente pelo gateway PaySuite — não pelo redirect.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void performSync()}
                disabled={isSyncBusy}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  background: isSyncBusy ? "#E5E7EB" : "#FDE68A",
                  color: isSyncBusy ? "#9CA3AF" : "#92400E",
                }}
              >
                {isSyncBusy ? "A verificar…" : "Verificar novamente"}
              </button>
              <Link
                href="/orders"
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #D1D5DB" }}
              >
                Voltar aos meus pedidos
              </Link>
            </div>
          </div>
        ) : null}

        {/* Status banner — idle and timed_out phases */}
        {(returnPhase === "idle" || returnPhase === "timed_out") ? (
          <div
            className="mt-5 rounded-[22px] border px-4 py-4"
            style={{ background: visual.bg, borderColor: visual.border, color: visual.color }}
          >
            <p className="text-sm font-black">{visual.title}</p>
            <p className="mt-1 text-sm leading-6">{visual.body}</p>
          </div>
        ) : null}

        {needsVerificationForPayment ? (
          <div
            className="mt-4 rounded-[22px] border px-4 py-4"
            style={{ background: "#FFF7E8", borderColor: "#FED7AA", color: "#7C2D12" }}
          >
            <p className="text-sm font-black">Verificacao necessaria para pagamento</p>
            <p className="mt-1 text-sm leading-6">
              Confirma o teu email ou telefone antes de iniciar pagamentos. Isto protege a tua conta e ajuda na recuperacao de acesso.
            </p>
            <Link href="/profile" className="mt-3 inline-flex rounded-xl px-4 py-2 text-sm font-black text-white" style={{ background: RED }}>
              Verificar agora
            </Link>
          </div>
        ) : null}

        {!isPaid ? (
          <div
            className="mt-4 rounded-2xl border px-4 py-4"
            style={{ background: "#FFF7ED", borderColor: "#FDBA74", color: "#7C2D12" }}
          >
            <p className="text-sm font-black">Pagamento com cuidado</p>
            <p className="mt-2 text-sm leading-6">
              Ainda nao recebemos confirmacao da PaySuite para este pagamento. Se o valor NAO saiu da tua conta, podes gerar uma nova tentativa de pagamento quando a verificacao indicar que nao ha evidencia financeira.
            </p>
            <p className="mt-2 text-sm leading-6 font-semibold">
              {PAYMENT_SUPPORT_MESSAGE}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl px-4 py-2 text-sm font-black text-white"
                style={{ background: "#16A34A" }}
              >
                Falar com suporte no WhatsApp
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="rounded-xl border px-4 py-2 text-sm font-black"
                style={{ borderColor: "#FDBA74", color: "#9A3412", background: "#FFFFFF" }}
              >
                Enviar email
              </a>
            </div>
          </div>
        ) : null}

        {/* Feedback banner */}
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

        {/* PAID — terminal success (reached via polling/webhook in idle phase) */}
        {isPaid && returnPhase === "idle" ? (
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
        {isProcessing && returnPhase === "idle" ? (
          <div
            className="mt-6 rounded-[24px] border p-5"
            style={{ borderColor: "#BFDBFE", background: "#EFF6FF" }}
          >
            <p className="text-sm font-semibold" style={{ color: "#1D4ED8" }}>
              A aguardar confirmação automática do pagamento. Esta página actualiza a cada 10 segundos.
            </p>
          </div>
        ) : null}

        {/* Active PaySuite payment — block new payment, show verify option */}
        {hasActivePaySuitePayment && returnPhase === "idle" ? (
          <div
            className="mt-4 rounded-2xl border px-4 py-4"
            style={{ background: "#EFF6FF", borderColor: "#BFDBFE" }}
          >
            <p className="text-sm font-black" style={{ color: "#1E40AF" }}>
              Pagamento em curso
            </p>
            <p className="mt-1 text-sm leading-6" style={{ color: "#374151" }}>
              Já existe uma tentativa de pagamento em curso para este pedido.
              {paysuitePayment?.providerReference && (
                <> Referência: <strong>{paysuitePayment.providerReference}</strong></>
              )}
            </p>
            <button
              type="button"
              onClick={() => void performSync()}
              disabled={isSyncBusy}
              className="mt-3 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                background: isSyncBusy ? "#E5E7EB" : "#DBEAFE",
                color: isSyncBusy ? "#9CA3AF" : "#1E40AF",
                border: "1px solid #BFDBFE",
              }}
            >
              {isSyncBusy ? "A verificar estado…" : "Verificar estado do pagamento"}
            </button>
          </div>
        ) : null}

        {/* Manual sync — idle, PENDING_PAYMENT, no active PaySuite tx */}
        {canGenerateRetry && verificationOk ? (
          <div
            className="mt-4 rounded-2xl border px-4 py-4"
            style={{ background: "#FFF7ED", borderColor: "#FDBA74" }}
          >
            <p className="text-sm font-black" style={{ color: "#9A3412" }}>
              Podes gerar uma nova tentativa
            </p>
            <p className="mt-1 text-sm leading-6" style={{ color: "#7C2D12" }}>
              Se o valor NÃO saiu da tua conta, podes gerar um novo checkout PaySuite. Se saiu, NÃO pagues novamente; fala com o suporte.
            </p>
            <button
              type="button"
              onClick={() => void handlePaySuiteRetry()}
              disabled={isPaySuiteBusy}
              className="mt-3 rounded-xl px-4 py-2 text-sm font-black text-white"
              style={{ background: isPaySuiteBusy ? "#9CA3AF" : RED }}
            >
              {isPaySuiteBusy ? "A gerar..." : "Gerar nova tentativa de pagamento"}
            </button>
          </div>
        ) : null}

        {canPay && !hasActivePaySuitePayment ? (
          <div
            className="mt-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: "#E5E7EB", background: "#F9FAFB" }}
          >
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Já pagaste via PaySuite mas o pedido ainda aparece como pendente?
            </p>
            <button
              type="button"
              onClick={() => void performSync()}
              disabled={isSyncBusy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                background: isSyncBusy ? "#E5E7EB" : "#F3F4F6",
                color: isSyncBusy ? "#9CA3AF" : "#374151",
                border: "1px solid #D1D5DB",
              }}
            >
              {isSyncBusy ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  A verificar estado…
                </>
              ) : "Verificar estado do pagamento"}
            </button>
          </div>
        ) : null}

        {/* CAN PAY — PaySuite method selector + pay button */}
        {(canPay || canRetryAfterTimeout) ? (
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
