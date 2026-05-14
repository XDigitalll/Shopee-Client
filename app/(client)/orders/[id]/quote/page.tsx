"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import type { Order } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { RelatedPurchasePanel } from "@/components/orders/related-purchase-panel";

const RED = "#E8431A";
const GREEN = "#2E8B57";
const paymentMethods = ["MPESA", "EMOLA", "VISA", "MASTERCARD", "BANK_TRANSFER"];

async function fetchWithToken<T>(url: string, _token: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Nao foi possivel carregar a proposta.");
  return payload as T;
}

function QuoteRow({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: number | undefined;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 text-sm"
      style={
        highlight
          ? { borderTop: "1px solid #F2D4CC", marginTop: 6, paddingTop: 14 }
          : { borderBottom: muted ? "1px dashed #F2D4CC" : "1px solid #F9EBE6" }
      }
    >
      <span style={{ color: highlight ? RED : "#6B7280" }}>{label}</span>
      <strong style={{ color: highlight ? RED : "#1A1410", fontFamily: highlight ? "'Sora', sans-serif" : undefined }}>
        {formatMoney(value)}
      </strong>
    </div>
  );
}

export default function OrderQuotePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [method, setMethod] = useState("MPESA");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("+258");
  const [transactionId, setTransactionId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const loadOrder = async () => {
      if (!token || !orderId) return;
      try {
        const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
        setAllOrders(orders);
        const currentOrder = orders.find((item) => item.id === orderId) || null;
        setOrder(currentOrder);
      } catch (error) {
        setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel carregar a proposta." });
      }
    };

    void loadOrder();
  }, [orderId, token]);

  const relatedOrders = useMemo(
    () => (order?.purchaseGroupKey ? allOrders.filter((item) => item.purchaseGroupKey === order.purchaseGroupKey) : []),
    [allOrders, order],
  );

  const inputClass = "w-full rounded-2xl border px-4 py-3 text-sm outline-none";
  const orderStatus = order?.status ?? "";
  const isPayOnDelivery = Boolean(order?.payOnDelivery) && order?.deliveryMethod === "DELIVERY";
  const showPaymentSection = ["PENDING_PAYMENT", "PAYMENT_REJECTED", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW"].includes(orderStatus)
    || (orderStatus === "PAID" && !isPayOnDelivery);
  const q = order?.quote;
  const finalAmount = orderVisibleTotal(order);
  const needsAccountVerification =
    feedback?.type === "error" &&
    /verifi|email|conta estiver pendente|codigo/i.test(feedback.msg);

  const handleAction = async (action: "approve" | "cancel") => {
    if (!token || !order) return;
    setIsBusy(true);
    setFeedback(null);
    try {
      const updatedOrder = await apiFetch<Order>(`orders/${order.id}/${action}`, { method: "PUT", token });

      if (action === "approve") {
        setOrder(updatedOrder);
        setFeedback({
          type: "success",
          msg:
            Boolean(updatedOrder.payOnDelivery) && updatedOrder.deliveryMethod === "DELIVERY"
              ? "Proposta aceite. Vamos seguir com entrega e cobranca no momento da rececao."
              : "Proposta aceite. Agora so falta submeter o teu pagamento para seguirmos com a compra.",
        });
        if (Boolean(updatedOrder.payOnDelivery) && updatedOrder.deliveryMethod === "DELIVERY") {
          router.push("/orders");
        }
      } else {
        router.push("/orders");
      }
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel atualizar o pedido." });
    } finally {
      setIsBusy(false);
    }
  };

  const handlePaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !order) return;

    setIsBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`orders/${order.id}/payment/manual`, {
        method: "POST",
        token,
        body: JSON.stringify({ method, payerName, payerPhone, transactionId, notes }),
      });
      router.push("/orders");
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel submeter o comprovativo." });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/orders" className="inline-flex rounded-full border px-4 py-2 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
        Voltar aos pedidos
      </Link>

      <RelatedPurchasePanel currentOrder={order} relatedOrders={relatedOrders} />

      <section className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Proposta da compra internacional</p>
            <h1 className="mt-1 text-3xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
              Pedido {orderDisplayCode(order ?? { id: orderId })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "#6B7280" }}>
              Aqui esta o preco final da tua compra, ja organizado para ficares com uma visao clara do que esta incluido e do proximo passo.
            </p>
          </div>

          <div className="rounded-[24px] border px-5 py-4" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Valor final</p>
            <p className="mt-2 text-3xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>
              {formatMoney(finalAmount)}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>
              {q?.quotedAt ? `Proposta preparada em ${formatDate(q.quotedAt)}` : "Aguardando atualizacao da proposta"}
            </p>
          </div>
        </div>

        {q ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[24px] p-5" style={{ background: "#FFF8F5" }}>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                  Detalhe da proposta
                </span>
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: q.active ? "#DCFCE7" : "#F3F4F6", color: q.active ? GREEN : "#6B7280" }}>
                  {q.active ? "Versao ativa" : "Versao anterior"}
                </span>
              </div>

              {(q.currency || q.exchangeRate) ? (
                <div className="mb-3 flex flex-wrap gap-3 rounded-2xl px-4 py-3 text-xs font-semibold" style={{ background: "#FFF4EF", color: "#6B7280" }}>
                  {q.currency ? <span>Moeda: <strong style={{ color: "#1A1410" }}>{q.currency}</strong></span> : null}
                  {q.exchangeRate ? <span>Câmbio: <strong style={{ color: "#1A1410" }}>1 {q.currency || "ZAR"} = {Number(q.exchangeRate).toFixed(2)} MZN</strong></span> : null}
                </div>
              ) : null}

              <div className="space-y-1">
                <QuoteRow label="Produto" value={q.productAmountMzn} />
                <QuoteRow label="Envio África do Sul → Maputo" value={q.shippingAmountMzn} />
                <QuoteRow label="Subtotal base" value={q.subtotalMzn} muted />
                {(q.riskReserveAmountMzn ?? 0) > 0 ? <QuoteRow label="Reserva de risco" value={q.riskReserveAmountMzn} /> : null}
                {(q.operationalCostAmountMzn ?? 0) > 0 ? <QuoteRow label="Taxa das alfândegas sul-africana" value={q.operationalCostAmountMzn} /> : null}
                <QuoteRow label="Taxa de servico XDigital" value={q.siteFeeAmountMzn} />
                {(q.localDeliveryAmountMzn ?? 0) > 0 ? <QuoteRow label="Entrega local" value={q.localDeliveryAmountMzn} /> : null}
                <QuoteRow label="Total final" value={q.finalAmountWithDeliveryMzn || q.finalAmountMzn} highlight />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: RED }}>O que esta incluido</p>
                <ul className="mt-4 space-y-3 text-sm" style={{ color: "#6B7280" }}>
                  <li>Preco do produto na loja de origem</li>
                  <li>Custos de compra e logistica internacional</li>
                  <li>Custos operacionais e de suporte local</li>
                  <li>{(q.localDeliveryAmountMzn ?? 0) > 0 ? "Entrega local ate o teu endereco" : "Preparacao para recolha ou entrega local"}</li>
                </ul>
              </div>

              <div className="rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: RED }}>Proximo passo</p>
                <p className="mt-3 text-sm leading-7" style={{ color: "#6B7280" }}>
                  {isPayOnDelivery
                    ? "Aceita a proposta para reservarmos a compra. O pagamento sera feito na entrega ao domicilio."
                    : "Aceita a proposta e submete o pagamento para seguirmos com a compra internacional em teu nome."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm" style={{ color: "#6B7280" }}>
            Ainda nao existe uma proposta pronta para este pedido.
          </p>
        )}

        {feedback ? (
          <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={feedback.type === "success" ? { background: "#F0FFF4", borderColor: "#BBF7D0", color: "#166534" } : { background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{feedback.msg}</span>
              {needsAccountVerification ? (
                <Link
                  href="/profile"
                  className="inline-flex shrink-0 justify-center rounded-xl px-4 py-2 text-sm font-black text-white"
                  style={{ background: RED }}
                >
                  Ir verificar
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {!showPaymentSection ? (
            <>
              <button
                type="button"
                onClick={() => void handleAction("approve")}
                disabled={isBusy || !q}
                className="rounded-2xl px-5 py-3 text-sm font-black text-white"
                style={{ background: isBusy || !q ? "#FDB8A7" : RED }}
              >
                {isBusy ? "A processar..." : isPayOnDelivery ? "Aceitar proposta" : "Aceitar e seguir para pagamento"}
              </button>
              <button
                type="button"
                onClick={() => void handleAction("cancel")}
                disabled={isBusy}
                className="rounded-2xl px-5 py-3 text-sm font-bold"
                style={{ background: "#FCEBEB", color: "#B42318" }}
              >
                Recusar proposta
              </button>
            </>
          ) : null}
        </div>
        {!showPaymentSection && order?.code && (
          <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "#FDBA74", background: "#FFFBF5", color: "#92400E" }}>
            <span className="font-bold">Tens o Telegram?</span>{" "}
            Responde diretamente no chat:{" "}
            <span className="rounded px-1 font-mono text-xs font-bold" style={{ background: "rgba(146,64,14,0.1)" }}>SIM {order.code}</span>{" "}
            para aceitar ou{" "}
            <span className="rounded px-1 font-mono text-xs font-bold" style={{ background: "rgba(146,64,14,0.1)" }}>NAO {order.code}</span>{" "}
            para recusar — sem precisar de abrir o site.
          </div>
        )}

        {showPaymentSection ? (
          <section className="mt-6 rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: RED }}>Pagamento</p>
                <h2 className="mt-1 text-2xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
                  Confirmar o teu pagamento
                </h2>
                <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>
                  Preenche os dados usados no pagamento para a nossa equipa validar e seguir com a compra.
                </p>
              </div>
              <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "#FFF8F5" }}>
                <span style={{ color: "#6B7280" }}>Total a pagar </span>
                <strong style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>
                  {formatMoney(finalAmount)}
                </strong>
              </div>
            </div>

            {orderStatus === "PAID" ? (
              <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ background: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" }}>
                O teu pagamento ja foi submetido e confirmado para este pedido.
              </div>
            ) : orderStatus === "PAYMENT_SUBMITTED" || orderStatus === "PAYMENT_UNDER_REVIEW" ? (
              <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ background: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }}>
                O pagamento ja foi submetido e esta a aguardar validacao financeira.
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "#F2D4CC", background: "#FFF8F5", color: "#6B7280" }}>
                <p>Para submeter o pagamento com comprovativo e validacao por metodo, abre a pagina segura de pagamento.</p>
                <Link href={`/orders/${orderId}/payment`} className="mt-4 inline-flex rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ background: RED }}>
                  {orderStatus === "PAYMENT_REJECTED" ? "Reenviar pagamento" : "Submeter pagamento"}
                </Link>
              </div>
            )}
          </section>
        ) : isPayOnDelivery ? (
          <section className="mt-6 rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
            <p className="text-sm font-semibold" style={{ color: RED }}>Entrega e cobranca</p>
            <h2 className="mt-1 text-2xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
              Pagamento no momento da entrega
            </h2>
            <div className="mt-4 rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "#F2D4CC", background: "#FFF8F5", color: "#6B7280" }}>
              Este pedido esta configurado com entrega ao domicilio e cobranca na rececao. O valor previsto para fechar a compra e
              <strong style={{ color: RED, fontFamily: "'Sora', sans-serif" }}> {formatMoney(finalAmount)}</strong>.
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
