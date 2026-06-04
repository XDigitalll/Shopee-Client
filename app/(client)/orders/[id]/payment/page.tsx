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

// idle       â€” normal page access (no ?psr=1)
// confirming â€” 0â€“90 s autonomous window after returning from PaySuite (zero buttons)
// confirmed  â€” payment detected as paid; show success + auto-redirect
// timed_out  â€” 90 s elapsed without confirmation; show calm message + manual verify only
type ReturnPhase = "idle" | "confirming" | "confirmed" | "timed_out";
type PaymentStateTone = "info" | "success" | "warning" | "danger" | "neutral";

const PAYSUITE_METHODS: Array<{ key: PaySuiteMethod; label: string; icon: string; hint: string }> = [
  { key: "MPESA", label: "M-Pesa", icon: "M", hint: "Pagamento instantÃ¢neo" },
  { key: "EMOLA", label: "eMola", icon: "E", hint: "Carteira digital" },
  { key: "CARD", label: "Visa", icon: "V", hint: "CartÃ£o Visa" },
];

const PAID_STATUSES = new Set([
  "PAID", "READY_FOR_FULFILLMENT", "PICKING", "PREPARING", "READY_FOR_DELIVERY",
  "TO_PURCHASE", "ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED",
]);

// Active PaySuite statuses â€” block creating a second payment while one exists.
const ACTIVE_PAYSUITE_STATUSES = new Set(["PENDING", "PROCESSING", "WAITING"]);

// Terminal statuses where no money will arrive â€” unblocks a new payment attempt.
const TERMINAL_PAYMENT_STATUSES = new Set(["FAILED", "CANCELLED", "AMOUNT_MISMATCH", "LATE_PAYMENT"]);

const RETURNING_POLL_DURATION_MS = 90_000;
const RETURNING_POLL_INTERVAL_MS = 3_000;
const IDLE_POLL_INTERVAL_MS = 10_000;
const CONFIRMED_REDIRECT_DELAY_MS = 3_000;
const PAYMENT_STATE_STYLES: Record<PaymentStateTone, { bg: string; border: string; color: string; soft: string }> = {
  info: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1E40AF", soft: "#DBEAFE" },
  success: { bg: "#F0FDF4", border: "#86EFAC", color: "#166534", soft: "#DCFCE7" },
  warning: { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E", soft: "#FEF3C7" },
  danger: { bg: "#FFF5F5", border: "#FECACA", color: "#991B1B", soft: "#FEE2E2" },
  neutral: { bg: "#F9FAFB", border: "#E5E7EB", color: "#374151", soft: "#F3F4F6" },
};

// Classify the gateway status string returned by the sync endpoint.
export function classifySyncResult(status?: string): "confirmed" | "pending" | "failed" {
  const s = (status ?? "").toLowerCase();
  if (["success", "completed", "paid", "confirmed"].includes(s)) return "confirmed";
  // amount_mismatch / late_payment: money may have arrived but payment cannot proceed â€”
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
      body: "Escolhe o mÃ©todo e clica em Pagar agora. A confirmaÃ§Ã£o Ã© automÃ¡tica quando o gateway processa o pagamento.",
      color: "#9A3412", bg: "#FFF7ED", border: "#FED7AA",
    },
    PAYMENT_SUBMITTED: {
      title: "Pagamento em processamento",
      body: "O teu pagamento estÃ¡ a ser processado. Esta pÃ¡gina actualiza automaticamente quando receber confirmaÃ§Ã£o.",
      color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE",
    },
    PAYMENT_UNDER_REVIEW: {
      title: "Pagamento em verificaÃ§Ã£o",
      body: "O pagamento estÃ¡ a ser verificado. ReceberÃ¡s uma notificaÃ§Ã£o assim que estiver confirmado.",
      color: "#5B21B6", bg: "#F5F3FF", border: "#DDD6FE",
    },
    PAYMENT_REJECTED: {
      title: "Pagamento nÃ£o confirmado",
      body: cleanDisplayText(adminMessage) || "O pagamento nÃ£o foi processado. Escolhe o mÃ©todo e tenta novamente.",
      color: "#991B1B", bg: "#FFF5F5", border: "#FECACA",
    },
    PAID: {
      title: "Pagamento confirmado",
      body: "O pagamento foi confirmado pelo gateway e o pedido estÃ¡ a avanÃ§ar para a prÃ³xima etapa.",
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
      "NÃ£o foi possÃ­vel carregar o pedido.",
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
  const [isInitialOrderLoading, setIsInitialOrderLoading] = useState(true);
  const [isInitialSyncLoading, setIsInitialSyncLoading] = useState(returningFromPaySuite);
  const [returnPhase, setReturnPhase] = useState<ReturnPhase>(
    returningFromPaySuite ? "confirming" : "idle",
  );
  const confirmingStartRef = useRef<number>(returningFromPaySuite ? Date.now() : 0);
  const [confirmingElapsed, setConfirmingElapsed] = useState(0);
  const [redirectCountdown, setRedirectCountdown] = useState(CONFIRMED_REDIRECT_DELAY_MS / 1000);

  const isPaySuiteBusy = paysuiteAction.isRunning;
  const isInitialPaymentLoading = isInitialOrderLoading || isInitialSyncLoading;

  const loadOrder = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!token || !orderId) {
      setIsInitialOrderLoading(false);
      return;
    }
    try {
      const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
      setAllOrders(orders);
      const currentOrder = orders.find((item) => item.id === orderId) || null;
      setOrder(currentOrder);

      // Keep paysuitePayment in sync with what the backend reports.
      // This ensures hasActivePaySuitePayment and syncConfirmedFailure are accurate
      // on fresh page load and after every background poll â€” not just after a
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
          msg: error instanceof Error ? error.message : "NÃ£o foi possÃ­vel carregar o pedido.",
        });
      }
    } finally {
      setIsInitialOrderLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  // Adaptive polling â€” fast during confirming, slow otherwise.
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
    if (!returningFromPaySuite) {
      setIsInitialSyncLoading(false);
      return;
    }
    if (!token || !orderId) {
      setIsInitialSyncLoading(false);
      return;
    }
    devLog("[PAYMENT_RETURN_STARTED]", { orderId });
    const timeout = window.setTimeout(() => { void performSync({ auto: true, initial: true }); }, 2000);
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
  // (a) backend reported PAYMENT_REJECTED â€” explicit server-side failure, OR
  // (b) the last sync (or background poll) confirmed a terminal payment status
  //     from the gateway: FAILED, CANCELLED, AMOUNT_MISMATCH, LATE_PAYMENT.
  //     The order may still be PENDING_PAYMENT but no money is coming â€” retry is safe.
  const explicitFailure = orderStatus === "PAYMENT_REJECTED";
  const syncConfirmedFailure = TERMINAL_PAYMENT_STATUSES.has(
    (paysuitePayment?.status ?? "").toUpperCase(),
  );
  const canRetryAfterTimeout = returnPhase === "timed_out"
    && verificationOk
    && (explicitFailure || syncConfirmedFailure)
    && !hasActivePaySuitePayment;
  const confirmingSecondsLeft = Math.max(
    0,
    Math.ceil((RETURNING_POLL_DURATION_MS - confirmingElapsed) / 1000),
  );
  const canShowSafeRetry = verificationOk && (canGenerateRetry || canRetryAfterTimeout);
  const paysuiteStatus = (paysuitePayment?.status ?? order?.payment?.status ?? "").toUpperCase();
  const paysuiteReference = paysuitePayment?.providerReference
    ?? paysuitePayment?.paymentReference
    ?? order?.payment?.providerReference
    ?? null;
  const paysuiteTransactionId = order?.payment?.transactionId ?? null;
  const paymentState = (() => {
    if (returnPhase === "confirmed" || isPaid) {
      return {
        tone: "success" as PaymentStateTone,
        icon: "âœ…",
        title: "Pagamento confirmado",
        body: "O teu pagamento foi recebido com sucesso. O pedido ja esta em processamento.",
        detail: returnPhase === "confirmed"
          ? `A redirecionar para os teus pedidos em ${redirectCountdown}s.`
          : null,
      };
    }

    if (paysuiteStatus === "LATE_PAYMENT") {
      return {
        tone: "warning" as PaymentStateTone,
        icon: "âš ï¸",
        title: "Recebemos um pagamento fora do tempo esperado",
        body: "A nossa equipa ira analisar este pagamento. Se o valor saiu da tua conta, nao pagues novamente.",
        detail: "Podes acompanhar o pedido por aqui ou falar com o suporte.",
      };
    }

    if (orderStatus === "PAYMENT_REJECTED" || ["FAILED", "CANCELLED", "AMOUNT_MISMATCH"].includes(paysuiteStatus)) {
      return {
        tone: "danger" as PaymentStateTone,
        icon: "âŒ",
        title: "O pagamento nao foi confirmado",
        body: cleanDisplayText(order?.adminMessageForClient)
          || "Este pagamento nao foi concluido. Gera uma nova tentativa apenas se o valor nao saiu da tua conta.",
        detail: canShowSafeRetry ? "Ja podes gerar uma nova tentativa segura." : null,
      };
    }

    if (returnPhase === "timed_out") {
      return {
        tone: canShowSafeRetry ? "warning" as PaymentStateTone : "info" as PaymentStateTone,
        icon: "â³",
        title: "Estamos a confirmar o teu pagamento",
        body: "Se o valor ja saiu da tua conta, nao pagues novamente. A confirmacao pode demorar alguns minutos.",
        detail: canShowSafeRetry
          ? "A ultima verificacao nao encontrou uma confirmacao activa para este pagamento."
          : "Usa Verificar atualizacao para consultar novamente a PaySuite.",
      };
    }

    if (returnPhase === "confirming" || hasActivePaySuitePayment || isProcessing) {
      return {
        tone: "info" as PaymentStateTone,
        icon: "â³",
        title: "Estamos a confirmar o pagamento",
        body: "Se o valor ja saiu da tua conta, nao pagues novamente. A confirmacao pode demorar alguns minutos.",
        detail: returnPhase === "confirming" && confirmingSecondsLeft > 0
          ? `A verificar automaticamente (${confirmingSecondsLeft}s restantes).`
          : "Esta pagina actualiza automaticamente quando o gateway enviar a confirmacao.",
      };
    }

    if (canGenerateRetry) {
      return {
        tone: "neutral" as PaymentStateTone,
        icon: "â†»",
        title: "Nova tentativa disponivel",
        body: "A verificacao nao encontrou evidencia financeira para a tentativa anterior. Se o valor nao saiu da tua conta, podes gerar um novo checkout.",
        detail: "Se o valor saiu, nao pagues novamente e fala com o suporte.",
      };
    }

    return {
      tone: "info" as PaymentStateTone,
      icon: "â³",
      title: visual.title === "Pagamento pendente" ? "Pronto para iniciar o pagamento" : visual.title,
      body: visual.body,
      detail: null,
    };
  })();
  const paymentStateStyle = PAYMENT_STATE_STYLES[paymentState.tone];

  async function performSync({ auto = false, initial = false }: { auto?: boolean; initial?: boolean } = {}) {
    if (!auto && isInitialPaymentLoading) return;
    if (syncInFlightRef.current) {
      if (initial) setIsInitialSyncLoading(false);
      return;
    } // mutex â€” blocks parallel calls
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
        // Use functional updater â€” performSync may be a stale closure (empty-deps auto-sync effect).
        setReturnPhase(prev => prev === "confirming" ? "timed_out" : prev);
        if (!auto) {
          setFeedback({ type: "error", msg: "Este pagamento nÃ£o foi concluÃ­do. Podes tentar novamente." });
        }
        devLog("[PAYMENT_SYNC_FAILED]", { orderId: targetId, status: syncResult.status });
      } else {
        // Persist pending sync result so hasActivePaySuitePayment reflects the latest
        // gateway state (e.g. keeps blocking a duplicate payment attempt).
        setPaysuitePayment(syncResult);
        if (!auto) {
          setFeedback({
            type: "error",
            msg: "Ainda estamos a confirmar o pagamento junto da PaySuite. Se o dinheiro jÃ¡ saiu da tua conta, nÃ£o efetues novo pagamento.",
          });
        }
        devLog("[PAYMENT_SYNC_PENDING]", { orderId: targetId, status: syncResult.status });
      }
    } catch (err) {
      const msg = normalizeClientError(err, "NÃ£o foi possÃ­vel verificar o estado do pagamento.").message;
      if (!auto) setFeedback({ type: "error", msg });
    } finally {
      syncInFlightRef.current = false;
      setIsSyncBusy(false);
      if (initial) setIsInitialSyncLoading(false);
    }
  }

  async function handlePaySuitePayment() {
    if (isInitialPaymentLoading) return;
    if (!isAuthenticated || !token) {
      setFeedback({ type: "error", msg: "A tua sessÃ£o expirou. Entra novamente para pagar." });
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
      setFieldError("O valor oficial do pedido ainda nÃ£o estÃ¡ disponÃ­vel. Actualiza a pÃ¡gina e tenta novamente.");
      return;
    }
    if (shouldBlockDuplicatePayment(paysuitePayment)) {
      setFeedback({ type: "error", msg: "JÃ¡ existe uma tentativa de pagamento em curso. Aguarda a confirmaÃ§Ã£o." });
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
          msg: "Pagamento iniciado. SerÃ¡s redireccionado para o checkout PaySuite.",
        });
        if (response.checkoutUrl) {
          window.location.assign(response.checkoutUrl);
        }
        return true;
      } catch (err) {
        capturedErrorMsg = normalizeClientError(
          err,
          "NÃ£o foi possÃ­vel iniciar o pagamento. Tenta novamente em alguns minutos.",
        ).message;
        throw err;
      }
    });

    if (!result) {
      setFeedback({
        type: "error",
        msg: capturedErrorMsg ?? "NÃ£o foi possÃ­vel iniciar o pagamento. Tenta novamente em alguns minutos.",
      });
    }
  }

  async function handlePaySuiteRetry() {
    if (isInitialPaymentLoading) return;
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

  return (
    <div className="relative mx-auto max-w-5xl pb-24 md:pb-0">
      {isInitialPaymentLoading ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 px-4 backdrop-blur-sm"
          aria-live="polite"
          role="status"
        >
          <div
            className="w-full max-w-xs rounded-[24px] border bg-white p-5 text-center shadow-[0_20px_60px_rgba(16,24,40,0.16)]"
            style={{ borderColor: "#F2D4CC" }}
          >
            <svg
              className="mx-auto h-8 w-8 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke={RED}
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p className="mt-4 text-sm font-black" style={{ color: "#1A1410" }}>
              A carregar dados do pagamento...
            </p>
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
              Aguarde um instante.
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={`space-y-5 transition ${isInitialPaymentLoading ? "pointer-events-none select-none opacity-60 blur-[2px]" : ""}`}
        aria-busy={isInitialPaymentLoading}
      >
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
              Paga via M-Pesa, eMola ou Visa. A confirmaÃ§Ã£o Ã© automÃ¡tica quando o gateway processa o pagamento.
            </p>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6" style={{ color: "#15803D" }}>
              Em breve poderÃ¡s consultar este pedido pelo WhatsApp. Por agora, acompanha o estado nesta pÃ¡gina ou em Meus pedidos.
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

        <div
          className="mt-6 rounded-[24px] border p-4 sm:p-5"
          style={{
            background: paymentStateStyle.bg,
            borderColor: paymentStateStyle.border,
            color: paymentStateStyle.color,
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ background: paymentStateStyle.soft }}
              aria-hidden="true"
            >
              {returnPhase === "confirming" ? (
                <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : paymentState.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black sm:text-xl">{paymentState.title}</p>
              <p className="mt-2 text-sm leading-6" style={{ color: "#374151" }}>
                {paymentState.body}
              </p>
              {paymentState.detail ? (
                <p className="mt-2 text-xs font-semibold leading-5" style={{ color: paymentStateStyle.color }}>
                  {paymentState.detail}
                </p>
              ) : null}
            </div>
          </div>

          {(paysuiteReference || paysuiteTransactionId || paysuiteStatus) ? (
            <div
              className="mt-4 grid gap-2 rounded-2xl border bg-white/70 p-3 text-xs sm:grid-cols-3"
              style={{ borderColor: paymentStateStyle.border }}
            >
              {paysuiteReference ? (
                <div>
                  <p className="font-semibold uppercase" style={{ color: "#6B7280" }}>Referencia</p>
                  <p className="mt-1 break-all font-black" style={{ color: "#1F2937" }}>{paysuiteReference}</p>
                </div>
              ) : null}
              {paysuiteTransactionId ? (
                <div>
                  <p className="font-semibold uppercase" style={{ color: "#6B7280" }}>Transacao</p>
                  <p className="mt-1 break-all font-black" style={{ color: "#1F2937" }}>{paysuiteTransactionId}</p>
                </div>
              ) : null}
              {paysuiteStatus ? (
                <div>
                  <p className="font-semibold uppercase" style={{ color: "#6B7280" }}>Estado PaySuite</p>
                  <p className="mt-1 break-all font-black" style={{ color: "#1F2937" }}>{paysuiteStatus}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {returnPhase !== "confirming" ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!isPaid ? (
                <button
                  type="button"
                  onClick={() => void performSync()}
                  disabled={isInitialPaymentLoading || isSyncBusy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{
                    background: isSyncBusy ? "#E5E7EB" : paymentStateStyle.soft,
                    color: isSyncBusy ? "#9CA3AF" : paymentStateStyle.color,
                    border: `1px solid ${paymentStateStyle.border}`,
                  }}
                >
                  {isSyncBusy ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      A verificar...
                    </>
                  ) : "Verificar atualizacao"}
                </button>
              ) : null}

              {canGenerateRetry && verificationOk ? (
                <button
                  type="button"
                  onClick={() => void handlePaySuiteRetry()}
                  disabled={isInitialPaymentLoading || isPaySuiteBusy}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-white"
                  style={{ background: isPaySuiteBusy ? "#9CA3AF" : GREEN }}
                >
                  {isPaySuiteBusy ? "A gerar..." : "Gerar nova tentativa"}
                </button>
              ) : null}

              {(returnPhase === "confirmed" || isPaid) ? (
                <Link
                  href="/orders"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-white"
                  style={{ background: GREEN }}
                >
                  Ver os meus pedidos
                </Link>
              ) : null}

              {returnPhase === "timed_out" ? (
                <Link
                  href="/orders"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold"
                  style={{ background: "#FFFFFF", borderColor: "#D1D5DB", color: "#374151" }}
                >
                  Voltar aos meus pedidos
                </Link>
              ) : null}
            </div>
          ) : null}

          {!isPaid ? (
            <div className="mt-4 border-t pt-3 text-xs leading-5" style={{ borderColor: paymentStateStyle.border, color: "#6B7280" }}>
              <p>{PAYMENT_SUPPORT_MESSAGE}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: "#15803D" }}>
                  Suporte WhatsApp
                </a>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold" style={{ color: "#4B5563" }}>
                  Email
                </a>
              </div>
            </div>
          ) : null}
        </div>


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


        {/* CAN PAY â€” PaySuite method selector + pay button */}
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
                    Escolhe o mÃ©todo de pagamento
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "#4B5563" }}>
                    A confirmaÃ§Ã£o Ã© automÃ¡tica apÃ³s o gateway processar o pagamento.
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
                      disabled={isInitialPaymentLoading || isPaySuiteBusy}
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
                  ReferÃªncia PaySuite: <strong>{paysuitePayment.providerReference}</strong>
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

            {/* Pay button â€” desktop */}
            <div className="hidden md:block">
              <button
                type="button"
                onClick={() => void handlePaySuitePayment()}
                disabled={isInitialPaymentLoading || isPaySuiteBusy || !officialAmount || officialAmount <= 0}
                className="w-full rounded-2xl px-5 py-4 text-base font-black text-white"
                style={{
                  background:
                    isInitialPaymentLoading || isPaySuiteBusy || !officialAmount || officialAmount <= 0
                      ? "#9CA3AF"
                      : GREEN,
                }}
              >
                {isPaySuiteBusy
                  ? "A iniciar pagamento..."
                  : canRetryAfterTimeout
                    ? "Gerar nova tentativa"
                    : `Pagar ${formatMoney(officialAmount)} agora`}
              </button>
              <ClientActionFeedback
                feedback={feedback}
                onClose={() => setFeedback(null)}
                actionLabel={
                  feedback?.type === "error" && /sessÃ£o expirada/i.test(feedback.msg)
                    ? "Entrar novamente"
                    : undefined
                }
                actionHref={
                  feedback?.type === "error" && /sessÃ£o expirada/i.test(feedback.msg)
                    ? `/login?redirect=%2Forders%2F${orderId}%2Fpayment`
                    : undefined
                }
              />
            </div>

            {/* Pay button â€” mobile sticky */}
            <div
              className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
              style={{ borderColor: "#F2D4CC" }}
            >
              <button
                type="button"
                onClick={() => void handlePaySuitePayment()}
                disabled={isInitialPaymentLoading || isPaySuiteBusy || !officialAmount || officialAmount <= 0}
                className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white"
                style={{
                  background:
                    isInitialPaymentLoading || isPaySuiteBusy || !officialAmount || officialAmount <= 0
                      ? "#9CA3AF"
                      : GREEN,
                }}
              >
                {isPaySuiteBusy ? "A iniciar..." : canRetryAfterTimeout ? "Gerar nova tentativa" : "Pagar agora"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      </div>
    </div>
  );
}
