"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { orderDisplayCode } from "@/lib/order-label";
import { orderVisibleTotal } from "@/lib/order-money";
import type { Order } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { RelatedPurchasePanel } from "@/components/orders/related-purchase-panel";

const RED = "#E8431A";
const paymentMethods = ["MPESA", "EMOLA", "VISA", "MASTERCARD", "BANK_TRANSFER"];

async function fetchWithToken<T>(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Nao foi possivel carregar o pagamento.");
  return payload as T;
}

export default function OrderPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [method, setMethod] = useState("MPESA");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("+258");
  const [transactionId, setTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const loadOrder = async () => {
      if (!token || !orderId) return;
      try {
        const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
        setAllOrders(orders);
        const currentOrder = orders.find((item) => item.id === orderId) || null;
        setOrder(currentOrder);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Nao foi possivel carregar o pedido.");
      }
    };

    void loadOrder();
  }, [orderId, token]);

  const relatedOrders = useMemo(
    () => (order?.purchaseGroupKey ? allOrders.filter((item) => item.purchaseGroupKey === order.purchaseGroupKey) : []),
    [allOrders, order],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !order) return;
    setIsBusy(true);
    try {
      await apiFetch(`orders/${order.id}/payment/manual`, {
        method: "POST",
        token,
        body: JSON.stringify({ method, payerName, payerPhone, transactionId, notes }),
      });
      router.push("/orders");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel submeter o comprovativo.");
    } finally {
      setIsBusy(false);
    }
  };

  const inputClass = "w-full rounded-2xl border px-4 py-3 text-sm outline-none";
  const totalAmount = orderVisibleTotal(order);
  const paymentRejected = order?.status === "FAILED" || order?.payment?.status === "FAILED";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/orders" className="inline-flex rounded-full border px-4 py-2 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
        Voltar aos pedidos
      </Link>

      <RelatedPurchasePanel currentOrder={order} relatedOrders={relatedOrders} />

      <section className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Pagamento manual</p>
            <h1 className="mt-1 text-3xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Pedido {orderDisplayCode(order ?? { id: orderId })}</h1>
            <p className="mt-2 text-sm leading-7" style={{ color: "#6B7280" }}>
              Partilha os dados do pagamento usado para a nossa equipa validar e seguir com a tua compra sem atrasos.
            </p>
          </div>
          <div className="rounded-[24px] border px-5 py-4" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Total a pagar</p>
            <p className="mt-2 text-3xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(totalAmount)}</p>
            <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>Usa o mesmo nome e numero do pagamento para facilitar a validacao.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: RED }}>Antes de enviar</p>
            <ul className="mt-4 space-y-3 text-sm" style={{ color: "#6B7280" }}>
              <li>Confirma se o valor pago coincide com o valor final da proposta.</li>
              <li>Usa a referencia ou codigo real da transaccao.</li>
              <li>Se precisares, deixa uma nota para ajudar a nossa equipa a validar mais rapido.</li>
            </ul>
          </div>

          <div className="rounded-[24px] border p-5" style={{ borderColor: "#F2D4CC", background: "#FFF8F5" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: RED }}>O que acontece depois</p>
            <div className="mt-4 space-y-3 text-sm" style={{ color: "#6B7280" }}>
              <p>1. Recebemos o teu comprovativo.</p>
              <p>2. A equipa confirma o pagamento.</p>
              <p>3. Seguimos com a compra e vais ver o estado atualizado no painel.</p>
            </div>
          </div>
        </div>

        {feedback ? <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}>{feedback}</div> : null}

        {paymentRejected ? (
          <div className="mt-6 rounded-[24px] border px-5 py-4" style={{ background: "#FFF5F5", borderColor: "#FECACA", color: "#991B1B" }}>
            <p className="text-sm font-black">Este pagamento foi recusado.</p>
            <p className="mt-2 text-sm leading-6">
              O pedido ja nao aceita novo comprovativo nesta pagina. Consulta a mensagem da ShopeeX nos teus pedidos.
            </p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold">Metodo</label>
            <select value={method} onChange={(event) => setMethod(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
              {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Nome do pagador</label>
            <input value={payerName} onChange={(event) => setPayerName(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Numero usado</label>
            <input value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} placeholder="+258849614486" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Referencia da transaccao</label>
            <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold">Notas</label>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} style={{ borderColor: "#F2D4CC", background: "#FFFDFC", minHeight: 110 }} />
          </div>
          <button type="submit" disabled={isBusy} className="md:col-span-2 rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ background: isBusy ? "#FDB8A7" : RED }}>
            {isBusy ? "A enviar..." : "Enviar comprovativo"}
          </button>
          {!isBusy ? (
            <p className="md:col-span-2 text-xs" style={{ color: "#6B7280" }}>
              Assim que validarmos o teu pagamento, o pedido segue para a proxima etapa e o estado sera atualizado automaticamente.
            </p>
          ) : null}
        </form>
        )}
      </section>
    </div>
  );
}
