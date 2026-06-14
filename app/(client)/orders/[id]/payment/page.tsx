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
import { getCsrfToken, XSRF_HEADER } from "@/lib/csrf";
import type { Order } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ClientActionFeedback } from "@/components/client-feedback-state";
import { RelatedPurchasePanel } from "@/components/orders/related-purchase-panel";
import { expireStoredSession, refreshStoredSession } from "@/lib/auth";
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
type ManualPaymentMethod = "BANK_TRANSFER" | "MPESA" | "EMOLA" | "VISA_MANUAL";
type Feedback = { type: "success" | "error"; msg: string } | null;
type PublicPaymentSetting = {
  method: ManualPaymentMethod | "VISA_MANUAL" | string;
  accountNumber?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  branch?: string | null;
  priority?: number | null;
  instructions?: string | null;
};

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

// 10-state machine — each state is mutually exclusive.
// loading_order      — initial page load, data not yet available
// confirming         — returned from PaySuite (?psr=1), webhook/sync confirmation window
// ready_to_pay       — PENDING_PAYMENT/PAYMENT_REJECTED, no active payment, method selector visible
// redirecting_to_paysuite — pay API call in progress, full overlay shown
// returned_pending   — after auto-sync or manual verify: payment not yet confirmed
// retry_warning      — warning modal displayed before allowing a new attempt
// retry_choose_method — user confirmed warning, method selector shown for retry
// confirmed          — payment confirmed, auto-redirect countdown running
// failed             — payment definitively failed (gateway terminal status)
// error_recoverable  — load error the user can recover by retrying
type PaymentUiState =
  | "loading_order"
  | "confirming"
  | "ready_to_pay"
  | "redirecting_to_paysuite"
  | "returned_pending"
  | "retry_warning"
  | "retry_choose_method"
  | "confirmed"
  | "failed"
  | "error_recoverable";

type PaymentStateTone = "info" | "success" | "warning" | "danger" | "neutral";

const MANUAL_METHODS: Array<{ key: ManualPaymentMethod; label: string; hint: string }> = [
  { key: "BANK_TRANSFER", label: "Transferencia bancaria", hint: "Transferencia para conta bancaria" },
  { key: "MPESA", label: "M-Pesa", hint: "Transferencia manual por carteira movel" },
  { key: "EMOLA", label: "e-Mola", hint: "Transferencia manual por carteira movel" },
  { key: "VISA_MANUAL", label: "Visa", hint: "Pagamento manual por cartao Visa" },
];

const PAYSUITE_METHODS: Array<{ key: PaySuiteMethod; label: string; icon: string; hint: string }> = [
  { key: "MPESA", label: "M-Pesa", icon: "M", hint: "Pagamento instantâneo" },
  { key: "EMOLA", label: "e-Mola", icon: "E", hint: "Carteira digital" },
  { key: "CARD", label: "Visa", icon: "V", hint: "Cartão Visa" },
];

const PAID_STATUSES = new Set([
  "PAID", "READY_FOR_FULFILLMENT", "PICKING", "PREPARING", "READY_FOR_DELIVERY",
  "TO_PURCHASE", "ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED",
]);

// Active PaySuite statuses — block creating a second payment while one exists.
const ACTIVE_PAYSUITE_STATUSES = new Set(["PENDING", "PROCESSING", "WAITING"]);

// Terminal PaySuite statuses that are safe to show as a real failed payment.
const TERMINAL_PAYMENT_STATUSES = new Set(["FAILED", "CANCELLED", "EXPIRED", "AMOUNT_MISMATCH"]);

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
  if (["failed", "cancelled", "expired", "amount_mismatch"].includes(s)) return "failed";
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

function manualMethodLabel(method: string) {
  if (method === "BANK_TRANSFER") return "Transferencia bancaria";
  if (method === "MPESA") return "M-Pesa";
  if (method === "EMOLA") return "e-Mola";
  if (method === "VISA_MANUAL") return "Visa";
  return method;
}

function settingValue(setting: PublicPaymentSetting | null | undefined) {
  if (!setting) return "";
  return [setting.bankName, setting.accountNumber, setting.accountHolder, setting.branch]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" | ");
}

function settingCopyValue(setting: PublicPaymentSetting | null | undefined) {
  return setting?.accountNumber?.trim() || "";
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
  const returningFromPaySuite = searchParams.get("psr") === "1";

  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const payActionAnchorRef = useRef<HTMLDivElement | null>(null);
  const paysuiteAction = useAsyncAction();
  const [paysuiteMethod, setPaysuiteMethod] = useState<PaySuiteMethod>("MPESA");
  const [paysuitePayment, setPaysuitePayment] = useState<PaySuiteInitResponse | null>(null);
  const [manualSettings, setManualSettings] = useState<PublicPaymentSetting[]>([]);
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>("BANK_TRANSFER");
  const [manualReference, setManualReference] = useState("");
  const [manualProofFile, setManualProofFile] = useState<File | null>(null);
  const [manualCopied, setManualCopied] = useState(false);
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);

  const manualSubmitInFlightRef = useRef(false);
  const loadOrderInFlightRef = useRef(false);
  const lastSilentLoadAtRef = useRef(0);
  const manualSubmitRefetchTimeoutRef = useRef<number | null>(null);

  // Mutex: prevents parallel sync calls regardless of UI state.
  const syncInFlightRef = useRef(false);
  // Guard: ensures [PAYMENT_RETURN_CONFIRMED] logs exactly once per page mount.
  const confirmedLoggedRef = useRef(false);
  const [isSyncBusy, setIsSyncBusy] = useState(false);

  const [uiState, setUiState] = useState<PaymentUiState>(
    returningFromPaySuite ? "confirming" : "loading_order",
  );
  const [redirectCountdown, setRedirectCountdown] = useState(CONFIRMED_REDIRECT_DELAY_MS / 1000);
  // True during the first 90 s after returning from PaySuite — drives faster background polling.
  const [fastPollActive, setFastPollActive] = useState(returningFromPaySuite);

  const isPaySuiteBusy = paysuiteAction.isRunning;
  const isExternalOrder = order?.type === "EXTERNAL";
  const isLoading = uiState === "loading_order" || uiState === "confirming";

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
  const explicitFailure = false;
  const syncConfirmedFailure = TERMINAL_PAYMENT_STATUSES.has(
    (paysuitePayment?.status ?? "").toUpperCase(),
  );
  // Safe to show the retry/change-method path when payment has definitively failed or backend says canRetry.
  const canShowSafeRetry = !isExternalOrder
    && verificationOk
    && !hasActivePaySuitePayment
    && (canGenerateRetry || explicitFailure || syncConfirmedFailure)
    && (uiState === "returned_pending" || uiState === "failed" || uiState === "retry_warning");

  // Method selector is shown only in these two states — eliminates all flicker from derived booleans.
  const methodSelectorVisible = !isExternalOrder && ((uiState === "ready_to_pay" && verificationOk) || uiState === "retry_choose_method");
  const manualPaymentVisible = isExternalOrder && verificationOk && !isPaid && (uiState === "ready_to_pay" || uiState === "failed");
  const needsVerificationForPayment = uiState === "ready_to_pay" && !verificationOk;
  // True when the method selector is for a retry/new-attempt (not a first payment).
  const isRetryContext = uiState === "retry_choose_method";

  const activeManualSetting = manualSettings.find((setting) => setting.method === manualMethod) ?? null;
  const sortedManualSettings = manualSettings
    .filter((setting) => ["BANK_TRANSFER", "MPESA", "EMOLA", "VISA_MANUAL"].includes(String(setting.method)))
    .sort((left, right) => Number(left.priority ?? 99) - Number(right.priority ?? 99));
  const paysuiteStatus = (paysuitePayment?.status ?? order?.payment?.status ?? "").toUpperCase();
  const paysuiteReference = paysuitePayment?.providerReference
    ?? paysuitePayment?.paymentReference
    ?? order?.payment?.providerReference
    ?? null;
  const paysuiteTransactionId = order?.payment?.transactionId ?? null;

  const payButtonLabel = isPaySuiteBusy
    ? "A iniciar pagamento..."
    : isRetryContext && canGenerateRetry
      ? `Gerar nova tentativa de pagamento — ${formatMoney(officialAmount)}`
      : `Pagar ${formatMoney(officialAmount)} agora`;

  // Status card content — single source of truth, derived from uiState.
  const statusCard = (() => {
    if (uiState === "confirmed" || isPaid) {
      return {
        tone: "success" as PaymentStateTone,
        icon: "✅" as string | null,
        showSpinner: false,
        title: "Pagamento confirmado",
        body: "O teu pagamento foi recebido com sucesso. O pedido ja esta em processamento.",
        detail: uiState === "confirmed"
          ? `A redirecionar para os teus pedidos em ${redirectCountdown}s.`
          : null,
      };
    }

    if (uiState === "redirecting_to_paysuite") {
      return {
        tone: "info" as PaymentStateTone,
        icon: null,
        showSpinner: true,
        title: "A iniciar pagamento...",
        body: "Estás a ser redirecionado para o checkout PaySuite. Não feches esta página.",
        detail: null,
      };
    }

    if (uiState === "confirming") {
      return {
        tone: "info" as PaymentStateTone,
        icon: null,
        showSpinner: true,
        title: "Estamos a confirmar o teu pagamento",
        body: "Estamos a confirmar o teu pagamento. Isto pode levar alguns segundos.",
        detail: "Se o valor saiu da tua conta, nao pagues novamente. O webhook da PaySuite pode demorar alguns instantes.",
      };
    }

    if (uiState === "failed") {
      return {
        tone: "danger" as PaymentStateTone,
        icon: "❌",
        showSpinner: false,
        title: "O pagamento nao foi confirmado",
        body: cleanDisplayText(order?.adminMessageForClient)
          || "Este pagamento nao foi concluido. Gera uma nova tentativa apenas se o valor nao saiu da tua conta.",
        detail: canShowSafeRetry ? "Ja podes gerar uma nova tentativa segura." : null,
      };
    }

    if (uiState === "returned_pending" || uiState === "retry_warning") {
      return {
        tone: canShowSafeRetry ? "warning" as PaymentStateTone : "info" as PaymentStateTone,
        icon: "⏳",
        showSpinner: false,
        title: "Estamos a confirmar o teu pagamento",
        body: isExternalOrder
          ? "Pagamento enviado para confirmacao. A confirmacao pode levar alguns minutos."
          : "Se o valor ja saiu da tua conta, nao pagues novamente. A confirmacao pode demorar alguns minutos.",
        detail: canShowSafeRetry
          ? "A ultima verificacao nao encontrou uma confirmacao activa para este pagamento."
          : isExternalOrder
            ? "A equipa financeira vai validar o comprovativo enviado."
            : "Esta pagina actualiza automaticamente quando o gateway enviar a confirmacao.",
      };
    }

    if (uiState === "retry_choose_method") {
      return {
        tone: "warning" as PaymentStateTone,
        icon: "↻",
        showSpinner: false,
        title: canGenerateRetry ? "Nova tentativa disponivel" : "Escolhe o metodo de pagamento",
        body: canGenerateRetry
          ? "A verificacao nao encontrou evidencia financeira para a tentativa anterior. Se o valor nao saiu da tua conta, podes gerar um novo checkout."
          : "Escolhe o metodo e paga novamente.",
        detail: "Se o valor saiu, nao pagues novamente e fala com o suporte.",
      };
    }

    if (uiState === "error_recoverable") {
      return {
        tone: "danger" as PaymentStateTone,
        icon: "⚠️",
        showSpinner: false,
        title: "Nao foi possivel carregar o pedido",
        body: "Verifica a tua ligacao a internet e tenta novamente.",
        detail: null,
      };
    }

    // ready_to_pay (and loading states — covered by overlay)
    return {
      tone: "info" as PaymentStateTone,
      icon: "⏳",
      showSpinner: false,
      title: visual.title === "Pagamento pendente" ? "Pronto para iniciar o pagamento" : visual.title,
      body: isExternalOrder ? "Escolhe uma forma de pagamento, faz a transferencia e envia o comprovativo para confirmacao." : visual.body,
      detail: null,
    };
  })();
  const paymentStateStyle = PAYMENT_STATE_STYLES[statusCard.tone];

  const loadOrder = useCallback(async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
    if (!token || !orderId) {
      if (!silent) setUiState(prev => prev === "loading_order" ? "error_recoverable" : prev);
      return;
    }
    const now = Date.now();
    if (loadOrderInFlightRef.current) return;
    if (silent && !force && now - lastSilentLoadAtRef.current < 4_000) return;
    loadOrderInFlightRef.current = true;
    if (silent) lastSilentLoadAtRef.current = now;
    try {
      const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
      setAllOrders(orders);
      const currentOrder = orders.find((item) => item.id === orderId) || null;
      setOrder(currentOrder);

      // Keep paysuitePayment in sync with what the backend reports.
      if (currentOrder?.payment?.provider?.toUpperCase() !== "PAYSUITE") {
        setPaysuitePayment(null);
      }

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
        setUiState("confirmed");
        if (!confirmedLoggedRef.current) {
          confirmedLoggedRef.current = true;
          devLog("[PAYMENT_RETURN_CONFIRMED]", { orderId, status: currentOrder.status });
        }
        return;
      }

      setUiState(prev => {
        if (prev === "confirmed") return prev; // never un-confirm

        if (!silent && prev === "loading_order") {
          // Initial load: compute first stable state.
          if (!currentOrder) return "error_recoverable";
          const status = currentOrder.status;
          const pmt = currentOrder.payment;
          const pmtPayload: PaySuiteInitResponse | null =
            pmt?.provider?.toUpperCase() === "PAYSUITE"
              ? { status: pmt.status, providerReference: pmt.providerReference, checkoutUrl: pmt.checkoutUrl, canRetry: false }
              : null;
          const active = isActivePaySuitePayment(pmtPayload);
          const processing = status === "PAYMENT_SUBMITTED" || status === "PAYMENT_UNDER_REVIEW";
          const terminalGateway = TERMINAL_PAYMENT_STATUSES.has((pmt?.status ?? "").toUpperCase());

          if (terminalGateway) return "failed";
          if (active || processing) return "returned_pending";
          if (status === "PENDING_PAYMENT" || status === "PAYMENT_REJECTED") return "ready_to_pay";
          return "returned_pending";
        }

        if (silent && currentOrder) {
          // Background poll: apply only safe, unambiguous transitions.
          const status = currentOrder.status;
          const pmt = currentOrder.payment;
          const pmtPayload: PaySuiteInitResponse | null =
            pmt?.provider?.toUpperCase() === "PAYSUITE"
              ? { status: pmt.status, providerReference: pmt.providerReference, checkoutUrl: pmt.checkoutUrl, canRetry: false }
              : null;
          const active = isActivePaySuitePayment(pmtPayload);
          const terminalGateway = TERMINAL_PAYMENT_STATUSES.has((pmt?.status ?? "").toUpperCase());

          // Active payment found while user is on the pay form: hide it to prevent duplicate payment.
          if (prev === "ready_to_pay" && active) return "returned_pending";
          // Gateway now reports a terminal failure: escalate to failed.
          if ((prev === "returned_pending" || prev === "confirming") && terminalGateway) return "failed";
        }

        return prev;
      });
    } catch (error) {
      if (!silent) {
        setFeedback({
          type: "error",
          msg: error instanceof Error ? error.message : "Não foi possível carregar o pedido.",
        });
        setUiState(prev => prev === "loading_order" ? "error_recoverable" : prev);
      }
    } finally {
      loadOrderInFlightRef.current = false;
    }
  }, [orderId, token]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  useEffect(() => {
    return () => {
      if (manualSubmitRefetchTimeoutRef.current) {
        window.clearTimeout(manualSubmitRefetchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPaymentSettings() {
      try {
        const response = await fetch("/api/payment-settings/public", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => []);
        if (!cancelled && response.ok && Array.isArray(payload)) {
          const manual = payload
            .filter((item: PublicPaymentSetting) => ["BANK_TRANSFER", "MPESA", "EMOLA", "VISA_MANUAL"].includes(String(item.method)))
            .sort((left: PublicPaymentSetting, right: PublicPaymentSetting) => Number(left.priority ?? 99) - Number(right.priority ?? 99));
          setManualSettings(manual);
          setManualMethod((current) =>
            manual.length > 0 && !manual.some((item: PublicPaymentSetting) => item.method === current)
              ? manual[0].method as ManualPaymentMethod
              : current
          );
        }
      } catch {
        if (!cancelled) setManualSettings([]);
      }
    }
    void loadPaymentSettings();
    return () => { cancelled = true; };
  }, []);

  // Adaptive polling — fast during the return window, slow otherwise.
  useEffect(() => {
    if (!token || !orderId || uiState === "confirmed") return;
    if (isExternalOrder && !returningFromPaySuite) return;
    if (!fastPollActive && (uiState === "ready_to_pay" || uiState === "failed" || uiState === "error_recoverable")) return;
    const intervalMs = fastPollActive ? RETURNING_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
    const interval = window.setInterval(() => { void loadOrder({ silent: true }); }, intervalMs);
    return () => window.clearInterval(interval);
  }, [loadOrder, orderId, token, uiState, fastPollActive, isExternalOrder, returningFromPaySuite]);

  // Return window: fast-poll timeout — after 90 s, drop back to slow polling.
  useEffect(() => {
    if (!returningFromPaySuite || !fastPollActive) return;
    const timer = window.setTimeout(() => {
      setFastPollActive(false);
      setUiState(prev => prev === "confirming" ? "returned_pending" : prev);
      setFeedback(prev => prev ?? {
        type: "error",
        msg: "Se o valor saiu da tua conta, não pague novamente. Aguarde 2 minutos e clique em verificar atualização.",
      });
      devLog("[PAYMENT_RETURN_TIMEOUT]", { orderId });
    }, RETURNING_POLL_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [fastPollActive, orderId, returningFromPaySuite]);

  // One automatic sync attempt 2 s after entering confirming phase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!returningFromPaySuite) return;
    if (!token || !orderId) {
      setUiState(prev => prev === "confirming" ? "returned_pending" : prev);
      return;
    }
    devLog("[PAYMENT_RETURN_STARTED]", { orderId });
    const timeout = window.setTimeout(() => { void performSync({ auto: true, initial: true }); }, 2000);
    return () => window.clearTimeout(timeout);
  // Intentionally runs once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect countdown after confirmed state.
  useEffect(() => {
    if (uiState !== "confirmed") return;
    const interval = window.setInterval(() => {
      setRedirectCountdown((c) => {
        if (c <= 1) { router.push("/orders"); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [uiState, router]);

  async function performSync({ auto = false, initial = false }: { auto?: boolean; initial?: boolean } = {}) {
    if (!auto && isLoading) return;
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
        setUiState("confirmed");
        setFeedback({ type: "success", msg: "Pagamento confirmado. O teu pedido foi actualizado." });
        devLog("[PAYMENT_SYNC_CONFIRMED]", { orderId: targetId, status: syncResult.status });
      } else if (outcome === "failed") {
        setPaysuitePayment(syncResult);
        // Functional updater: stale closure cannot override "confirmed" if polling already confirmed it.
        setUiState(prev => prev === "confirmed" ? "confirmed" : "failed");
        if (!auto) {
          setFeedback({ type: "error", msg: "Este pagamento não foi concluído. Podes tentar novamente apenas se o valor não saiu da tua conta." });
        }
        devLog("[PAYMENT_SYNC_FAILED]", { orderId: targetId, status: syncResult.status });
      } else {
        setPaysuitePayment(syncResult);
        if (initial) {
          setUiState(prev => {
            if (prev === "confirmed") return "confirmed";
            if (prev === "confirming" && fastPollActive) return "confirming";
            return "returned_pending";
          });
        }
        if (!auto) {
          setFeedback({
            type: "success",
            msg: "Estamos a confirmar o teu pagamento. Isto pode levar alguns segundos.",
          });
        }
        devLog("[PAYMENT_SYNC_PENDING]", { orderId: targetId, status: syncResult.status });
      }
    } catch (err) {
      if (initial) {
        setUiState(prev => {
          if (prev === "confirmed") return "confirmed";
          if (prev === "confirming" && fastPollActive) return "confirming";
          return "returned_pending";
        });
      }
      const msg = normalizeClientError(err, "Não foi possível verificar o estado do pagamento.").message;
      if (!auto) setFeedback({ type: "error", msg });
    } finally {
      syncInFlightRef.current = false;
      setIsSyncBusy(false);
    }
  }

  async function handlePaySuitePayment() {
    if (isLoading) return;
    if (isPaid || uiState === "confirmed") return;
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
    const prevState = uiState;
    setUiState("redirecting_to_paysuite");

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
      setUiState(prevState);
      setFeedback({
        type: "error",
        msg: capturedErrorMsg ?? "Não foi possível iniciar o pagamento. Tenta novamente em alguns minutos.",
      });
    }
  }

  async function handlePaySuiteRetry() {
    if (isLoading) return;
    if (isPaid || uiState === "confirmed") return;
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

    const prevState = uiState;
    setUiState("redirecting_to_paysuite");

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
      setUiState(prevState);
      setFeedback({
        type: "error",
        msg: "Nao foi possivel gerar uma nova tentativa. Se o valor saiu da tua conta, nao pagues novamente; fala com o suporte.",
      });
    }
  }

  function selectPaymentMethod(method: PaySuiteMethod) {
    setPaysuiteMethod(method);
    if (window.matchMedia("(max-width: 767px)").matches) return;
    window.requestAnimationFrame(() => {
      payActionAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function copyManualDetails() {
    const value = settingCopyValue(activeManualSetting);
    if (!value || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(value);
    setManualCopied(true);
    window.setTimeout(() => setManualCopied(false), 1600);
  }

  async function submitManualProof(orderIdToSubmit: number, formData: FormData) {
    const headers = new Headers();
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set(XSRF_HEADER, csrfToken);

    let response = await fetch(`/api/payments/${orderIdToSubmit}/submit`, {
      method: "POST",
      headers,
      body: formData,
      credentials: "same-origin",
    });

    if (response.status === 403) {
      const refreshed = await refreshStoredSession().catch(() => null);
      const refreshedCsrfToken = getCsrfToken();
      if (refreshed && refreshedCsrfToken && refreshedCsrfToken !== csrfToken) {
        const retryHeaders = new Headers();
        retryHeaders.set(XSRF_HEADER, refreshedCsrfToken);
        response = await fetch(`/api/payments/${orderIdToSubmit}/submit`, {
          method: "POST",
          headers: retryHeaders,
          body: formData,
          credentials: "same-origin",
        });
      }
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && typeof payload.message === "string"
        ? payload.message
        : "Nao foi possivel enviar o comprovativo.";
      throw Object.assign(new Error(message), { status: response.status });
    }

    return payload;
  }

  function manualSubmitErrorMessage(error: unknown) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status)
      : undefined;
    const message = error instanceof Error ? error.message : "";
    if (status === 403 && /csrf|xsrf|seguran|expir/i.test(message)) {
      return "A tua sessão expirou. Atualiza a página e tenta novamente.";
    }
    return normalizeClientError(error, "Nao foi possivel enviar o comprovativo.", status).message;
  }

  async function handleManualPaymentSubmit() {
    if (manualSubmitInFlightRef.current || isManualSubmitting || isLoading) return;
    manualSubmitInFlightRef.current = true;
    if (!isAuthenticated || !token) {
      manualSubmitInFlightRef.current = false;
      setFeedback({ type: "error", msg: "A tua sessao expirou. Entra novamente para enviar o comprovativo." });
      await expireStoredSession();
      router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
      return;
    }
    if (!order || !isExternalOrder) {
      manualSubmitInFlightRef.current = false;
      return;
    }
    if (!verificationOk) {
      manualSubmitInFlightRef.current = false;
      setFeedback({ type: "error", msg: "Verifica o teu email ou telefone antes de confirmar pagamentos." });
      router.push("/profile");
      return;
    }
    if (!officialAmount || officialAmount <= 0) {
      manualSubmitInFlightRef.current = false;
      setFieldError("O valor oficial do pedido ainda nao esta disponivel. Actualiza a pagina e tenta novamente.");
      return;
    }
    if (!manualProofFile) {
      manualSubmitInFlightRef.current = false;
      setFieldError("Envia o comprovativo do pagamento para confirmacao.");
      return;
    }

    setIsManualSubmitting(true);
    setFieldError(null);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append("paymentMethod", manualMethod);
      formData.append("amount", String(officialAmount));
      formData.append("currency", "MZN");
      if (manualReference.trim()) {
        formData.append("payerName", manualReference.trim());
        formData.append("transactionReference", manualReference.trim());
      }
      formData.append("file", manualProofFile);

      await submitManualProof(order.id, formData);

      setManualProofFile(null);
      setManualReference("");
      setOrder((current) => current && current.id === order.id ? { ...current, status: "PAYMENT_SUBMITTED" } : current);
      setUiState("returned_pending");
      setFeedback({ type: "success", msg: "Pagamento enviado para confirmacao. A confirmacao pode levar alguns minutos." });
      if (manualSubmitRefetchTimeoutRef.current) {
        window.clearTimeout(manualSubmitRefetchTimeoutRef.current);
      }
      manualSubmitRefetchTimeoutRef.current = window.setTimeout(() => {
        void loadOrder({ silent: true, force: true });
      }, 1200);
    } catch (err) {
      setFeedback({ type: "error", msg: manualSubmitErrorMessage(err) });
    } finally {
      manualSubmitInFlightRef.current = false;
      setIsManualSubmitting(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-5xl pb-24 md:pb-0">
      {/* Full-page overlay: initial load or confirming payment after PaySuite return */}
      {isLoading ? (
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
              {uiState === "confirming"
                ? "Estamos a confirmar o teu pagamento."
                : "A carregar dados do pagamento..."}
            </p>
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
              {uiState === "confirming"
                ? "Isto pode levar alguns segundos."
                : "Aguarde um instante."}
            </p>
          </div>
        </div>
      ) : null}

      {/* Redirect overlay: pay API call in progress — locks UI, prevents double-tap */}
      {uiState === "redirecting_to_paysuite" ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-white/80 px-4 backdrop-blur-sm"
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
              stroke={GREEN}
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p className="mt-4 text-sm font-black" style={{ color: "#1A1410" }}>
              A iniciar pagamento...
            </p>
            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
              Não feches esta página.
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={`space-y-5 transition ${isLoading ? "pointer-events-none select-none opacity-60 blur-[2px]" : ""}`}
        aria-busy={isLoading}
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
              {isExternalOrder ? "Paga por transferencia bancaria, M-Pesa ou e-Mola e envia o comprovativo para confirmacao." : "Paga via M-Pesa, eMola ou Visa. A confirmacao e automatica quando o gateway processa o pagamento."}
            </p>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6" style={{ color: "#15803D" }}>
              Em breve poderás consultar este pedido pelo WhatsApp. Por agora, acompanha o estado nesta página ou em Meus pedidos.
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

        {/* Status card */}
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
              {statusCard.showSpinner ? (
                <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth={2}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : statusCard.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black sm:text-xl">{statusCard.title}</p>
              <p className="mt-2 text-sm leading-6" style={{ color: "#374151" }}>
                {statusCard.body}
              </p>
              {statusCard.detail ? (
                <p className="mt-2 text-xs font-semibold leading-5" style={{ color: paymentStateStyle.color }}>
                  {statusCard.detail}
                </p>
              ) : null}
            </div>
          </div>

          {(!isExternalOrder && (paysuiteReference || paysuiteTransactionId || paysuiteStatus)) ? (
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

          {/* Status card action buttons */}
          {uiState !== "redirecting_to_paysuite" ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {/* Verify button: shown in any non-terminal, non-pay-form state */}
              {!isExternalOrder && !isPaid && uiState !== "ready_to_pay" && uiState !== "retry_choose_method" && uiState !== "loading_order" && uiState !== "confirming" ? (
                <button
                  type="button"
                  onClick={() => void performSync()}
                  disabled={isSyncBusy}
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
                  ) : "Verificar atualização"}
                </button>
              ) : null}

              {/* Retry / change method — only shown when payment has definitively failed or canRetry */}
              {canShowSafeRetry && !isPaid ? (
                <button
                  type="button"
                  onClick={() => setUiState("retry_warning")}
                  disabled={isPaySuiteBusy}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold"
                  style={{ background: "#FFFFFF", borderColor: "#D1D5DB", color: "#374151" }}
                >
                  Alterar método de pagamento / tentar novamente
                </button>
              ) : null}

              {/* Back to pending from retry_choose_method */}
              {uiState === "retry_choose_method" ? (
                <button
                  type="button"
                  onClick={() => setUiState("returned_pending")}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold"
                  style={{ background: "#FFFFFF", borderColor: "#D1D5DB", color: "#374151" }}
                >
                  ← Cancelar
                </button>
              ) : null}

              {(uiState === "confirmed" || isPaid) ? (
                <Link
                  href="/orders"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-black text-white"
                  style={{ background: GREEN }}
                >
                  Ver os meus pedidos
                </Link>
              ) : null}

              {(uiState === "returned_pending" || uiState === "failed") ? (
                <Link
                  href="/orders"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold"
                  style={{ background: "#FFFFFF", borderColor: "#D1D5DB", color: "#374151" }}
                >
                  Voltar aos meus pedidos
                </Link>
              ) : null}

              {uiState === "error_recoverable" ? (
                <button
                  type="button"
                  onClick={() => { setUiState("loading_order"); void loadOrder(); }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{ background: paymentStateStyle.soft, color: paymentStateStyle.color, border: `1px solid ${paymentStateStyle.border}` }}
                >
                  Tentar novamente
                </button>
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


        {manualPaymentVisible ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-[24px] border p-5" style={{ borderColor: "#C7E7D3", background: "#F7FCF9" }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black" style={{ color: "#14532D", fontFamily: "'Sora', sans-serif" }}>
                    Escolhe como vais pagar
                  </p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "#4B5563" }}>
                    Depois do pagamento, envia o comprovativo para confirmacao.
                  </p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#DCFCE7", color: "#166534" }}>
                  Confirmacao manual
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(sortedManualSettings.length ? sortedManualSettings : MANUAL_METHODS).map((item) => {
                  const key = String("method" in item ? item.method : item.key) as ManualPaymentMethod;
                  const active = manualMethod === key;
                  const label = "label" in item ? item.label : manualMethodLabel(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setManualMethod(key)}
                      disabled={isManualSubmitting}
                      className="flex min-h-[112px] flex-col justify-between rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 disabled:hover:translate-y-0"
                      style={{
                        borderColor: active ? GREEN : "#C7E7D3",
                        background: active ? "#ECFDF5" : "#FFFFFF",
                        boxShadow: active ? "0 0 0 3px rgba(46,139,87,0.10)" : "none",
                      }}
                    >
                      <span className="text-sm font-black" style={{ color: "#1A1410" }}>{label}</span>
                      <span className="mt-2 text-xs leading-5" style={{ color: "#6B7280" }}>
                        {"hint" in item ? item.hint : item.instructions || "Transferencia manual com comprovativo."}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border bg-white p-4" style={{ borderColor: "#DDEFE4" }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase" style={{ color: "#6B7280" }}>Dados para pagamento</p>
                    <p className="mt-2 text-sm font-black" style={{ color: "#1F2937" }}>{manualMethodLabel(manualMethod)}</p>
                    {activeManualSetting ? (
                      <div className="mt-2 space-y-1 text-sm" style={{ color: "#374151" }}>
                        {activeManualSetting.bankName ? <p>Banco: <strong>{activeManualSetting.bankName}</strong></p> : null}
                        {activeManualSetting.accountNumber ? <p>Conta/numero: <strong>{activeManualSetting.accountNumber}</strong></p> : null}
                        {activeManualSetting.accountHolder ? <p>Titular: <strong>{activeManualSetting.accountHolder}</strong></p> : null}
                        {activeManualSetting.branch ? <p>Balcao: <strong>{activeManualSetting.branch}</strong></p> : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm" style={{ color: "#92400E" }}>
                        Dados de pagamento indisponiveis. Contacta o suporte antes de transferir.
                      </p>
                    )}
                    <p className="mt-3 text-sm leading-6" style={{ color: "#4B5563" }}>
                      {activeManualSetting?.instructions || "Apos pagar, anexa o comprovativo abaixo. Nao envies varios comprovativos do mesmo pagamento."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyManualDetails()}
                    disabled={!settingCopyValue(activeManualSetting)}
                    className="min-h-11 rounded-xl border px-4 py-2 text-sm font-black disabled:opacity-50"
                    style={{ borderColor: "#C7E7D3", color: GREEN, background: "#FFFFFF" }}
                  >
                    {manualCopied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-black" style={{ color: "#1A1410" }}>
                  Nome do titular/ultimos digitos (opcional)
                </span>
                <input
                  value={manualReference}
                  onChange={(event) => setManualReference(event.target.value)}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#D1D5DB", color: "#1F2937" }}
                  placeholder="Ex.: Ana M. / 1234"
                />
              </label>

              <label className="mt-4 block rounded-2xl border border-dashed bg-white px-4 py-5 text-center" style={{ borderColor: "#C7E7D3" }}>
                <span className="block text-sm font-black" style={{ color: "#1A1410" }}>
                  {manualProofFile ? manualProofFile.name : "Selecionar comprovativo"}
                </span>
                <span className="mt-1 block text-xs" style={{ color: "#6B7280" }}>
                  Imagem ou PDF. A validacao do ficheiro e feita com seguranca.
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="sr-only"
                  onChange={(event) => setManualProofFile(event.target.files?.[0] ?? null)}
                />
              </label>

              <div className="mt-4 rounded-2xl border px-4 py-3 text-sm leading-6" style={{ borderColor: "#FDE68A", background: "#FFFBEB", color: "#92400E" }}>
                <p>Depois do pagamento, envia o comprovativo para confirmacao.</p>
                <p>A confirmacao pode levar alguns minutos.</p>
                <p>Nao envies varios comprovativos do mesmo pagamento.</p>
              </div>

              {fieldError ? (
                <div className="mt-3 rounded-2xl border px-4 py-3 text-sm" style={{ background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}>
                  {fieldError}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void handleManualPaymentSubmit()}
              disabled={isManualSubmitting || !officialAmount || officialAmount <= 0 || !manualProofFile}
              className="w-full rounded-2xl px-5 py-4 text-base font-black text-white disabled:cursor-not-allowed"
              style={{ background: isManualSubmitting || !officialAmount || officialAmount <= 0 || !manualProofFile ? "#9CA3AF" : GREEN }}
            >
              {isManualSubmitting ? "A enviar comprovativo..." : "Enviar comprovativo para confirmacao"}
            </button>
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


        {/* PaySuite method selector + pay button: visible only in ready_to_pay or retry_choose_method */}
        {methodSelectorVisible ? (
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
                      onClick={() => selectPaymentMethod(item.key)}
                      disabled={isPaySuiteBusy}
                      className="group flex min-h-[142px] flex-col justify-between rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(20,83,45,0.10)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
                      style={{
                        borderColor: active ? GREEN : "#C7E7D3",
                        background: active ? "#ECFDF5" : "#FFFFFF",
                        boxShadow: active ? "0 0 0 3px rgba(46,139,87,0.10)" : "none",
                      }}
                    >
                      <span
                        className="flex h-[62px] items-center justify-center rounded-2xl border bg-white px-3"
                        style={{ borderColor: active ? "#2E8B5755" : "#E5E7EB" }}
                      >
                        {item.key === "MPESA" ? (
                          <img
                            src="/payment-methods/mpesa.png"
                            alt="M-Pesa"
                            className="max-h-11 max-w-[132px] object-contain"
                          />
                        ) : item.key === "EMOLA" ? (
                          <img
                            src="/payment-methods/emola.png"
                            alt="e-Mola"
                            className="max-h-11 max-w-[132px] object-contain"
                          />
                        ) : (
                          <span className="font-[family-name:var(--font-sora)] text-2xl font-black tracking-[0.08em] text-[#1A4DB3]">
                            VISA
                          </span>
                        )}
                      </span>
                      <span className="mt-3 block">
                        <span className="block text-sm font-black" style={{ color: "#1A1410" }}>
                          {item.label}
                        </span>
                        <span className="mt-1 block text-xs" style={{ color: "#6B7280" }}>
                          {item.hint}
                        </span>
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
            <div ref={payActionAnchorRef} className="h-0 scroll-mt-24" />

            <div className="hidden md:block">
              <button
                type="button"
                onClick={() => void (isRetryContext && canGenerateRetry ? handlePaySuiteRetry() : handlePaySuitePayment())}
                disabled={isPaySuiteBusy || !officialAmount || officialAmount <= 0}
                className="w-full rounded-2xl px-5 py-4 text-base font-black text-white"
                style={{
                  background:
                    isPaySuiteBusy || !officialAmount || officialAmount <= 0
                      ? "#9CA3AF"
                      : GREEN,
                }}
              >
                {payButtonLabel}
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
                onClick={() => void (isRetryContext && canGenerateRetry ? handlePaySuiteRetry() : handlePaySuitePayment())}
                disabled={isPaySuiteBusy || !officialAmount || officialAmount <= 0}
                className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white"
                style={{
                  background:
                    isPaySuiteBusy || !officialAmount || officialAmount <= 0
                      ? "#9CA3AF"
                      : GREEN,
                }}
              >
                {payButtonLabel}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      </div>

      {/* Warning modal — shown when uiState === "retry_warning" */}
      {uiState === "retry_warning" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="retry-warning-title"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.20)]">
            <p
              id="retry-warning-title"
              className="text-lg font-black"
              style={{ color: "#991B1B" }}
            >
              Atenção antes de gerar novo pagamento
            </p>
            <p className="mt-3 text-sm leading-6" style={{ color: "#374151" }}>
              Se o valor saiu da tua conta, <strong>NÃO cries outro pagamento.</strong>
              <br />
              Aguarda pelo menos 2 minutos e clica em <strong>&quot;Verificar atualização&quot;</strong>.
              <br />
              Só continua se tens certeza de que nenhum valor saiu da tua conta.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => { setUiState("returned_pending"); void performSync(); }}
                className="w-full rounded-2xl px-4 py-3 text-sm font-black text-white"
                style={{ background: GREEN }}
              >
                Voltar e verificar atualização
              </button>
              <button
                type="button"
                onClick={() => setUiState("retry_choose_method")}
                className="w-full rounded-2xl border px-4 py-3 text-sm font-semibold"
                style={{ borderColor: "#D1D5DB", color: "#374151" }}
              >
                Tenho certeza, quero escolher outro método
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
