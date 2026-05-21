"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { emitClientDataChanged } from "@/lib/api-client";
import { getCsrfToken, XSRF_HEADER } from "@/lib/csrf";
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
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

const PAYMENT_CONFIG = {
  MPESA_NUMBER: process.env.NEXT_PUBLIC_MPESA_NUMBER || "",
  EMOLA_NUMBER: process.env.NEXT_PUBLIC_EMOLA_NUMBER || "",
  BANK_NAME: process.env.NEXT_PUBLIC_BANK_NAME || "",
  BANK_ACCOUNT: process.env.NEXT_PUBLIC_BANK_ACCOUNT || "",
  ACCOUNT_HOLDER: process.env.NEXT_PUBLIC_ACCOUNT_HOLDER || "",
};

type PaymentMethodType = "MPESA" | "EMOLA" | "BANK_TRANSFER" | "VISA_MANUAL";
type Feedback = { type: "success" | "error"; msg: string } | null;
type SubmissionResponse = {
  id?: number;
  status?: string;
  orderStatus?: string;
  reviewNote?: string;
};

const METHODS: Array<{ key: PaymentMethodType; label: string; icon: string; hint: string }> = [
  { key: "MPESA", label: "M-Pesa", icon: "M", hint: "Pagamento movel" },
  { key: "EMOLA", label: "eMola", icon: "E", hint: "Carteira movel" },
  { key: "BANK_TRANSFER", label: "Transferencia", icon: "B", hint: "Banco" },
  { key: "VISA_MANUAL", label: "Visa / Cartao", icon: "V", hint: "Manual" },
];

async function fetchWithToken<T>(url: string, _token: string) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(normalizeClientError(payload?.message || payload?.error || "Não foi possível carregar o pedido.").message);
  return payload as T;
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("258")) digits = digits.slice(3);
  return digits;
}

function validPhoneForMethod(method: PaymentMethodType, phone: string) {
  const digits = normalizePhone(phone);
  if (method === "MPESA") return /^(84|85)\d{7}$/.test(digits);
  if (method === "EMOLA") return /^(86|87)\d{7}$/.test(digits);
  return true;
}

function statusCopy(status?: string, adminMessage?: string) {
  const map: Record<string, { title: string; body: string; color: string; bg: string; border: string }> = {
    PENDING_PAYMENT: {
      title: "Pagamento pendente",
      body: "Escolhe o método, faz o pagamento e submete os dados para análise.",
      color: "#9A3412",
      bg: "#FFF7ED",
      border: "#FED7AA",
    },
    PAYMENT_SUBMITTED: {
      title: "Pagamento submetido para validação",
      body: "Recebemos os dados do pagamento. A equipa financeira vai validar e avisar assim que estiver tudo certo.",
      color: "#1D4ED8",
      bg: "#EFF6FF",
      border: "#BFDBFE",
    },
    PAYMENT_UNDER_REVIEW: {
      title: "Pagamento em análise",
      body: "A equipa financeira está a rever os dados enviados.",
      color: "#5B21B6",
      bg: "#F5F3FF",
      border: "#DDD6FE",
    },
    PAYMENT_REJECTED: {
      title: "Pagamento recusado",
      body: cleanDisplayText(adminMessage) || "Revê os dados e submete novamente o pagamento.",
      color: "#991B1B",
      bg: "#FFF5F5",
      border: "#FECACA",
    },
    PAID: {
      title: "Pagamento confirmado",
      body: "O pagamento foi validado e o pedido segue para a próxima etapa.",
      color: "#166534",
      bg: "#F0FDF4",
      border: "#86EFAC",
    },
  };

  return map[status || ""] || {
    title: "Pagamento",
    body: "Acompanha aqui o estado do pagamento deste pedido.",
    color: "#4B5563",
    bg: "#F9FAFB",
    border: "#E5E7EB",
  };
}

function methodInstructions(method: PaymentMethodType, amount: number) {
  if (method === "MPESA") {
    return [
      ["Numero da empresa", PAYMENT_CONFIG.MPESA_NUMBER],
      ["Nome da conta", PAYMENT_CONFIG.ACCOUNT_HOLDER],
      ["Valor", formatMoney(amount)],
      ["Depois", "Envia dinheiro e preenche o numero que efectuou o pagamento."],
    ];
  }
  if (method === "EMOLA") {
    return [
      ["Numero da empresa", PAYMENT_CONFIG.EMOLA_NUMBER],
      ["Nome da conta", PAYMENT_CONFIG.ACCOUNT_HOLDER],
      ["Valor", formatMoney(amount)],
      ["Depois", "Envia dinheiro e preenche o numero que efectuou o pagamento."],
    ];
  }
  if (method === "BANK_TRANSFER") {
    return [
      ["Banco", PAYMENT_CONFIG.BANK_NAME],
      ["Conta / NIB", PAYMENT_CONFIG.BANK_ACCOUNT],
      ["Titular", PAYMENT_CONFIG.ACCOUNT_HOLDER],
      ["Valor", formatMoney(amount)],
    ];
  }
  return [
    ["Metodo", "Pagamento por cartao/manual"],
    ["Titular", PAYMENT_CONFIG.ACCOUNT_HOLDER],
    ["Valor", formatMoney(amount)],
    ["Nota", "Guarda o comprovativo se estiver disponivel."],
  ];
}

function paymentSubmitErrorMessage(payload: unknown, status?: number) {
  const message = payload && typeof payload === "object"
    ? String((payload as Record<string, unknown>).message || (payload as Record<string, unknown>).error || "")
    : "";
  const code = payload && typeof payload === "object"
    ? String((payload as Record<string, unknown>).code || "")
    : "";

  if (status === 401 || code === "AUTHENTICATION_REQUIRED") {
    return "A tua sessão expirou. Entra novamente para submeter o pagamento.";
  }
  if (code === "VERIFICATION_REQUIRED") {
    return "Verifica o teu email ou telefone antes de submeter o pagamento.";
  }

  return message || "Nao foi possivel submeter o pagamento.";
}

export default function OrderPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [method, setMethod] = useState<PaymentMethodType>("MPESA");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerBank, setPayerBank] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [last4, setLast4] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const submitAction = useAsyncAction();
  const isBusy = submitAction.isRunning;
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);

  const loadOrder = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!token || !orderId) return;
    try {
      const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
      setAllOrders(orders);
      const currentOrder = orders.find((item) => item.id === orderId) || null;
      setOrder(currentOrder);
      if (!silent) {
        setPayerName(currentOrder?.customerFullName || "");
        setPayerPhone(currentOrder?.primaryPhoneNumber || "");
      }
    } catch (error) {
      if (!silent) {
        setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel carregar o pedido." });
      }
    }
  }, [orderId, token]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!token || !orderId) return;
    const interval = window.setInterval(() => {
      void loadOrder({ silent: true });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [loadOrder, orderId, token]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setFilePreview(null);
      return;
    }
    const preview = URL.createObjectURL(file);
    setFilePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);

  const relatedOrders = useMemo(
    () => (order?.purchaseGroupKey ? allOrders.filter((item) => item.purchaseGroupKey === order.purchaseGroupKey) : []),
    [allOrders, order],
  );

  const officialAmount = orderVisibleTotal(order);
  const orderStatus = submission?.orderStatus || order?.status || "";
  const visual = statusCopy(orderStatus, order?.adminMessageForClient || submission?.reviewNote);
  const canSubmit = orderStatus === "PENDING_PAYMENT" || orderStatus === "PAYMENT_REJECTED";
  const isLocked = ["PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAID"].includes(orderStatus);
  const inputClass = "w-full rounded-2xl border px-4 py-3 text-base outline-none";

  function validateFile(nextFile: File | null) {
    if (!nextFile) return null;
    const extension = `.${nextFile.name.split(".").pop()?.toLowerCase() || ""}`;
    if (!ACCEPTED_TYPES.includes(nextFile.type) && !ACCEPTED_EXTENSIONS.includes(extension)) {
      return "Formato inválido. Usa jpg, jpeg, png, webp ou pdf.";
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      return "O comprovativo deve ter no máximo 10MB.";
    }
    return null;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] || null;
    const error = validateFile(nextFile);
    if (error) {
      setFieldError(error);
      setFile(null);
      event.target.value = "";
      return;
    }
    setFieldError(null);
    setFile(nextFile);
  }

  function validateForm() {
    if (!payerName.trim()) return "Informe o nome do titular.";
    if (!officialAmount || officialAmount <= 0) return "O valor oficial do pedido ainda nao esta disponivel. Actualiza a pagina e tenta novamente.";
    if ((method === "MPESA" || method === "EMOLA") && !validPhoneForMethod(method, payerPhone)) {
      return method === "MPESA"
        ? "Numero M-Pesa invalido. Usa +25884xxxxxxx, +25885xxxxxxx, 84xxxxxxx ou 85xxxxxxx."
        : "Numero eMola invalido. Usa +25886xxxxxxx, +25887xxxxxxx, 86xxxxxxx ou 87xxxxxxx.";
    }
    if (method === "BANK_TRANSFER") {
      if (!payerBank.trim()) return "Informe o banco usado na transferencia.";
      if (!transactionReference.trim()) return "Informe a referencia da transferencia.";
      if (!file) return "Anexa o comprovativo da transferencia.";
    }
    const fileError = validateFile(file);
    if (fileError) return fileError;
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated || !token) {
      const message = "A tua sessão expirou. Entra novamente para submeter o pagamento.";
      setFeedback({ type: "error", msg: message });
      await expireStoredSession();
      router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
      return;
    }
    if (!order) return;

    const validationError = validateForm();
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setFieldError(null);
    setFeedback(null);

    const payload = {
      paymentMethod: method,
      payerName: payerName.trim(),
      payerPhone: payerPhone.trim() || null,
      payerBank: payerBank.trim() || null,
      transactionReference: transactionReference.trim() || null,
      amount: officialAmount,
      currency: "MZN",
      metadata: {
        source: "client-web",
        last4: method === "VISA_MANUAL" && last4.trim() ? last4.trim() : undefined,
      },
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    if (file) formData.append("file", file);

    const result = await submitAction.run(async () => {
      const response = await fetch(`/api/payments/${order.id}/submit`, {
        method: "POST",
        headers: getCsrfToken() ? { [XSRF_HEADER]: getCsrfToken() } : undefined,
        body: formData,
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = paymentSubmitErrorMessage(data, response.status);
        if (response.status === 401) {
          await expireStoredSession();
          router.replace(`/login?redirect=${encodeURIComponent(`/orders/${orderId}/payment`)}`);
        }
        throw new Error(message);
      }
      setSubmission(data as SubmissionResponse);
      setOrder((current) => current ? { ...current, status: "PAYMENT_SUBMITTED" } : current);
      setFeedback(null);
      emitClientDataChanged();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    });
    if (!result) {
      setFeedback({ type: "error", msg: normalizeClientError(submitAction.error, "Não foi possível submeter o pagamento. Tenta novamente.").message });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 md:pb-0">
      <Link href="/orders" className="inline-flex rounded-full border px-4 py-2 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
        Voltar aos pedidos
      </Link>

      <RelatedPurchasePanel currentOrder={order} relatedOrders={relatedOrders} />

      <section className="rounded-[28px] border bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Pagamento do pedido</p>
            <h1 className="mt-1 text-3xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
              Pedido {orderDisplayCode(order ?? { id: orderId })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "#6B7280" }}>
              Submete o pagamento para a equipa financeira validar antes do pedido avançar.
            </p>
          </div>
          <div className="rounded-[24px] border px-5 py-4" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Total a pagar</p>
            <p className="mt-2 text-3xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(officialAmount)}</p>
            <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>Estado actual: {orderStatus || "A carregar"}</p>
          </div>
        </div>

        <div className="mt-5 rounded-[22px] border px-4 py-4" style={{ background: visual.bg, borderColor: visual.border, color: visual.color }}>
          <p className="text-sm font-black">{visual.title}</p>
          <p className="mt-1 text-sm leading-6">{visual.body}</p>
        </div>

        {feedback && (feedback.type === "error" || !isLocked) ? (
          <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={feedback.type === "success" ? { background: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" } : { background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}>
            {feedback.msg}
          </div>
        ) : null}

        {isLocked ? (
          <div className="mt-6 rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
            <p className="text-sm font-semibold" style={{ color: "#6B7280" }}>
              Não é preciso submeter outro comprovativo agora. Quando a validação terminar, o estado do pedido será actualizado automaticamente.
            </p>
          </div>
        ) : null}

        {canSubmit ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <section>
              <p className="text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Escolhe o método</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {METHODS.map((item) => {
                  const active = method === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMethod(item.key)}
                      className="rounded-[22px] border p-4 text-left transition"
                      style={{ borderColor: active ? RED : "#F2D4CC", background: active ? "#FFF4EF" : "#FFFDFC" }}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black text-white" style={{ background: active ? RED : "#9CA3AF" }}>{item.icon}</span>
                      <span className="mt-3 block text-sm font-black" style={{ color: "#1A1410" }}>{item.label}</span>
                      <span className="mt-1 block text-xs" style={{ color: "#6B7280" }}>{item.hint}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
                <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: RED }}>Instrucoes</p>
                <div className="mt-4 space-y-3">
                  {methodInstructions(method, officialAmount).map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white/75 px-4 py-3">
                      <p className="text-xs font-semibold" style={{ color: "#9CA3AF" }}>{label}</p>
                      <p className="mt-1 text-sm font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Nome do titular</span>
                  <input value={payerName} onChange={(event) => setPayerName(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Valor pago</span>
                  <input readOnly value={formatMoney(officialAmount)} className={`${inputClass} cursor-not-allowed font-black`} style={{ borderColor: "#F2D4CC", background: "#F9FAFB", color: "#374151" }} aria-readonly="true" />
                  <span className="mt-1 block text-xs" style={{ color: "#6B7280" }}>Valor oficial do pedido/cotacao aprovada.</span>
                </label>

                {(method === "MPESA" || method === "EMOLA") ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">Numero que efectuou o pagamento</span>
                    <input value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} placeholder={method === "MPESA" ? "+25884xxxxxxx ou +25885xxxxxxx" : "+25886xxxxxxx ou +25887xxxxxxx"} />
                    <span className="mt-1 block text-xs" style={{ color: "#6B7280" }}>Pode ser diferente do numero da tua conta.</span>
                  </label>
                ) : null}

                {method === "BANK_TRANSFER" ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">Banco do pagador</span>
                    <input value={payerBank} onChange={(event) => setPayerBank(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} placeholder="Ex: BCI, Millennium BIM" />
                  </label>
                ) : null}

                {method === "VISA_MANUAL" ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">Ultimos 4 digitos</span>
                    <input inputMode="numeric" maxLength={4} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} placeholder="Opcional" />
                  </label>
                ) : null}

                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">
                    Referencia da transaccao {method === "BANK_TRANSFER" ? "" : <span style={{ color: "#9CA3AF" }}>(opcional)</span>}
                  </span>
                  <input value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} />
                </label>

                <div className="md:col-span-2">
                  <div className="rounded-[24px] border border-dashed p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black">Comprovativo</p>
                        <p className="mt-1 text-xs" style={{ color: "#6B7280" }}>
                          {method === "BANK_TRANSFER" ? "Obrigatório para transferência bancária." : "Recomendado para acelerar a validação."}
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer justify-center rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
                        Escolher ficheiro
                        <input type="file" accept={ACCEPTED_EXTENSIONS.join(",")} onChange={handleFileChange} className="hidden" />
                      </label>
                    </div>

                    {file ? (
                      <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
                        {filePreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={filePreview} alt="Preview do comprovativo" className="max-h-56 w-full rounded-2xl object-contain" />
                        ) : (
                          <p className="text-sm font-bold" style={{ color: "#1A1410" }}>{file.name}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs" style={{ color: "#6B7280" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          <button type="button" onClick={() => setFile(null)} className="rounded-xl border px-3 py-1.5 text-xs font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
                            Remover
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            {fieldError ? <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}>{fieldError}</div> : null}

            <div className="hidden md:block">
              <button type="submit" disabled={isBusy} className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white" style={{ background: isBusy ? "#FDB8A7" : RED }}>
                {isBusy ? "A submeter..." : "Submeter pagamento"}
              </button>
              <ClientActionFeedback
                feedback={feedback}
                onClose={() => setFeedback(null)}
                actionLabel={feedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(feedback.msg) ? "Entrar novamente" : undefined}
                actionHref={feedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(feedback.msg) ? `/login?redirect=%2Forders%2F${orderId}%2Fpayment` : undefined}
              />
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden" style={{ borderColor: "#F2D4CC" }}>
              <button type="submit" disabled={isBusy} className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white" style={{ background: isBusy ? "#FDB8A7" : RED }}>
                {isBusy ? "A submeter..." : "Submeter pagamento"}
              </button>
              <ClientActionFeedback
                feedback={feedback}
                onClose={() => setFeedback(null)}
                actionLabel={feedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(feedback.msg) ? "Entrar novamente" : undefined}
                actionHref={feedback?.type === "error" && /sessão expirada|Inicia sessão/i.test(feedback.msg) ? `/login?redirect=%2Forders%2F${orderId}%2Fpayment` : undefined}
              />
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
