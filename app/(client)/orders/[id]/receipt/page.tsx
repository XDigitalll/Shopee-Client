"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, formatMoney } from "@/lib/format";
import { orderVisibleTotal } from "@/lib/order-money";
import type { Order } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { RelatedPurchasePanel } from "@/components/orders/related-purchase-panel";

const RED = "#E8431A";
const GREEN = "#2E8B57";

async function fetchWithToken<T>(url: string, _token: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Nao foi possivel carregar o recibo.");
  return payload as T;
}

function humanize(value?: string) {
  if (!value) return "--";
  const map: Record<string, string> = {
    INTERNAL: "Pedido da loja",
    EXTERNAL: "Pedido externo",
    DELIVERY: "Entrega ao domicilio",
    STORE_PICKUP: "Levantamento na loja",
    MPESA: "M-Pesa",
    EMOLA: "e-Mola",
    BANK_TRANSFER: "Transferencia bancaria",
    PENDING: "Pendente",
    APPROVED: "Aprovado",
    PAID: "Pago",
    DELIVERED: "Entregue",
  };
  return map[value] || value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function buildAddress(order: Order) {
  if (order.deliveryMethod === "STORE_PICKUP") return "Levantamento na loja";
  return [
    order.deliveryCity,
    order.deliveryNeighborhood,
    order.deliveryStreet,
    order.houseNumber ? `Casa ${order.houseNumber}` : "",
    order.deliveryReference,
  ].filter(Boolean).join(", ") || "--";
}

export default function OrderReceiptPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOrder = async () => {
      if (!token || !orderId) return;
      try {
        const orders = await fetchWithToken<Order[]>("/api/orders/my-orders", token);
        setAllOrders(orders);
        const currentOrder = orders.find((item) => item.id === orderId) || null;
        setOrder(currentOrder);
        if (!currentOrder) {
          setError("Nao foi possivel localizar este recibo.");
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar o recibo.");
      }
    };

    void loadOrder();
  }, [orderId, token]);

  const relatedOrders = useMemo(
    () => (order?.purchaseGroupKey ? allOrders.filter((item) => item.purchaseGroupKey === order.purchaseGroupKey) : []),
    [allOrders, order],
  );

  const summary = useMemo(() => {
    const itemsTotal = Number(order?.items?.reduce((sum, item) => sum + Number(item.subtotal || item.price || 0), 0) || 0);
    const deliveryFee = Number(order?.deliveryFee || 0);
    const total = orderVisibleTotal(order) || itemsTotal + deliveryFee;
    return { itemsTotal, deliveryFee, total };
  }, [order]);

  const isExternal = order?.type === "EXTERNAL";

  const externalBreakdown = useMemo(() => {
    const productAmount = Number(order?.quote?.productAmountMzn || 0);
    const shippingAmount = Number(order?.quote?.shippingAmountMzn || 0);
    const riskReserveAmount = Number(order?.quote?.riskReserveAmountMzn || 0);
    const operationalCostAmount = Number(order?.quote?.operationalCostAmountMzn || 0);
    const siteFeeAmount = Number(order?.quote?.siteFeeAmountMzn || 0);
    const subtotalAmount = Number(order?.quote?.subtotalMzn || 0);
    const localDelivery = Number(order?.deliveryFee || 0);
    const finalAmount = orderVisibleTotal(order);

    return [
      { label: "Valor da compra no site", value: productAmount },
      { label: "Envio África do Sul → Maputo", value: shippingAmount },
      { label: "Reserva de risco", value: riskReserveAmount },
      { label: "Taxa das alfândegas sul-africana", value: operationalCostAmount },
      { label: "Comissao ShopeeX Digital", value: siteFeeAmount },
      { label: "Subtotal da cotacao", value: subtotalAmount, highlight: true },
      { label: "Entrega local", value: localDelivery },
      { label: "Total final", value: finalAmount, accent: true },
    ];
  }, [order]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-5 pb-10">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/orders" className="inline-flex rounded-full border px-4 py-2 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
          Voltar aos pedidos
        </Link>
        <button type="button" onClick={handlePrint} className="inline-flex rounded-full px-4 py-2 text-sm font-black text-white" style={{ background: RED }}>
          Baixar em PDF
        </button>
      </div>

      <div className="no-print">
        <RelatedPurchasePanel currentOrder={order} relatedOrders={relatedOrders} />
      </div>

      {error && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: "#FFF5F5", borderColor: "#FECACA", color: "#B42318" }}>
          {error}
        </div>
      )}

      <section id="receipt-sheet" className="min-w-0 rounded-[24px] border bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6 md:p-8" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between" style={{ borderColor: "#F2D4CC" }}>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: RED }}>ShopeeX Digital</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Recibo do pedido</h1>
            <p className="mt-2 max-w-xl text-sm" style={{ color: "#6B7280" }}>
              Comprovativo completo do teu pedido, pronto para imprimir ou guardar em PDF.
            </p>
          </div>

          <div className="min-w-0 rounded-[24px] px-4 py-4 sm:px-5" style={{ background: "linear-gradient(135deg, #FFF4EF 0%, #FFFDFC 100%)" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#9CA3AF" }}>Recibo</p>
            <p className="mt-2 break-words text-xl font-black sm:text-2xl" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>#{order?.id || orderId}</p>
            <p className="mt-1 break-words text-sm" style={{ color: "#6B7280" }}>Emitido em {formatDate(order?.deliveryDate || order?.paymentDate || order?.orderDate)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Estado final", value: humanize(order?.status) },
            { label: "Tipo de pedido", value: humanize(order?.type) },
            { label: "Entrega", value: humanize(order?.deliveryMethod) },
            { label: "Loja", value: order?.sourceStore ? humanize(order.sourceStore) : "Loja ShopeeX Digital" },
          ].map((item) => (
            <article key={item.label} className="min-w-0 rounded-[24px] border px-4 py-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{item.label}</p>
              <p className="mt-2 break-words text-sm font-bold" style={{ color: "#1A1410" }}>{item.value}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <article className="min-w-0 rounded-[24px] border p-4 sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-black sm:text-xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Dados do cliente</h2>
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "#ECFDF5", color: GREEN }}>Confirmado</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Nome</p><p className="mt-1 break-words text-sm font-semibold" style={{ color: "#1A1410" }}>{order?.customerFullName || "--"}</p></div>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Email</p><p className="mt-1 break-all text-sm font-semibold" style={{ color: "#1A1410" }}>{order?.customerEmail || "--"}</p></div>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Telefone principal</p><p className="mt-1 break-words text-sm font-semibold" style={{ color: "#1A1410" }}>{order?.primaryPhoneNumber || "--"}</p></div>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Telefone alternativo</p><p className="mt-1 break-words text-sm font-semibold" style={{ color: "#1A1410" }}>{order?.alternativePhoneNumber || "--"}</p></div>
              </div>
            </article>

            <article className="min-w-0 rounded-[24px] border p-4 sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <h2 className="text-lg font-black sm:text-xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Detalhes da entrega</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Modalidade</p><p className="mt-1 break-words text-sm font-semibold" style={{ color: "#1A1410" }}>{humanize(order?.deliveryMethod)}</p></div>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Morada</p><p className="mt-1 break-words text-sm font-semibold" style={{ color: "#1A1410" }}>{buildAddress(order || { id: 0, type: "", status: "" } as Order)}</p></div>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Maps</p><p className="mt-1 break-all text-sm font-semibold" style={{ color: "#1A1410" }}>{order?.googleMapsLink || "--"}</p></div>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Observacoes</p><p className="mt-1 break-words text-sm font-semibold" style={{ color: "#1A1410" }}>{order?.customerNotes || "--"}</p></div>
              </div>
            </article>

            <article className="min-w-0 rounded-[24px] border p-4 sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <h2 className="text-lg font-black sm:text-xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Itens do pedido</h2>
              <div className="mt-4 overflow-hidden rounded-[22px] border" style={{ borderColor: "#F2D4CC" }}>
                <table className="receipt-items-table w-full border-collapse text-sm">
                  <thead style={{ background: "#FFF8F5" }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-bold" style={{ color: "#6B7280" }}>Item</th>
                      <th className="px-4 py-3 text-center font-bold" style={{ color: "#6B7280" }}>Qtd.</th>
                      <th className="px-4 py-3 text-right font-bold" style={{ color: "#6B7280" }}>Preco</th>
                      <th className="px-4 py-3 text-right font-bold" style={{ color: "#6B7280" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order?.items?.length ? order.items : [{ productName: order?.sourceStore ? `Pedido ${humanize(order.sourceStore)}` : "Pedido sem itens detalhados", quantity: 1, subtotal: summary.total }]).map((item, index) => (
                      <tr key={`${item.productName}-${index}`} style={{ borderTop: index === 0 ? "none" : "1px solid #F2D4CC" }}>
                        <td className="px-4 py-3" data-label="Item" style={{ color: "#1A1410" }}>
                          <div className="min-w-0">
                            <p className="break-words">{item.productName || "Item"}</p>
                            {item.productCode ? (
                              <p className="mt-1 break-all text-xs font-bold uppercase tracking-wide" style={{ color: RED }}>
                                Código físico: {item.productCode}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center" data-label="Qtd." style={{ color: "#6B7280" }}>{item.quantity || 1}</td>
                        <td className="px-4 py-3 text-right" data-label="Preco" style={{ color: "#6B7280" }}>{formatMoney(Number(item.price || 0))}</td>
                        <td className="px-4 py-3 text-right font-bold" data-label="Subtotal" style={{ color: "#1A1410" }}>{formatMoney(Number(item.subtotal || item.price || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          <div className="space-y-6">
            <article className="min-w-0 rounded-[24px] border p-4 sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC", background: "linear-gradient(180deg, #FFF8F5 0%, #FFFFFF 100%)" }}>
              <h2 className="text-lg font-black sm:text-xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
                {isExternal ? "Resumo financeiro detalhado" : "Resumo financeiro"}
              </h2>

              {isExternal && order?.quote ? (
                <div className="mt-4 space-y-3 text-sm">
                  {externalBreakdown.map((line) => (
                    <div key={line.label} className="receipt-info-row flex items-start justify-between gap-4">
                      <span className="min-w-0 break-words" style={{ color: line.accent ? RED : "#6B7280", fontWeight: line.highlight ? 700 : 500 }}>{line.label}</span>
                      <strong className="shrink-0 text-right" style={{ color: line.accent ? RED : "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(line.value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-3 text-sm">
                  <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Subtotal dos itens</span><strong className="shrink-0 text-right" style={{ color: "#1A1410" }}>{formatMoney(summary.itemsTotal)}</strong></div>
                  <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Entrega</span><strong className="shrink-0 text-right" style={{ color: "#1A1410" }}>{formatMoney(summary.deliveryFee)}</strong></div>
                  <div className="h-px" style={{ background: "#F2D4CC" }} />
                  <div className="receipt-info-row flex items-start justify-between gap-4 text-base"><span className="min-w-0 break-words" style={{ color: RED }}>Total pago</span><strong className="shrink-0 text-right" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(summary.total)}</strong></div>
                </div>
              )}
            </article>

            <article className="min-w-0 rounded-[24px] border p-4 sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <h2 className="text-lg font-black sm:text-xl" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Pagamento</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Metodo</span><strong className="min-w-0 break-words text-right" style={{ color: "#1A1410" }}>{humanize(order?.payment?.method)}</strong></div>
                <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Estado</span><strong className="min-w-0 break-words text-right" style={{ color: GREEN }}>{humanize(order?.payment?.status || order?.status)}</strong></div>
                <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Referencia</span><strong className="min-w-0 break-all text-right" style={{ color: "#1A1410" }}>{order?.payment?.transactionId || "--"}</strong></div>
                <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Pagador</span><strong className="min-w-0 break-words text-right" style={{ color: "#1A1410" }}>{order?.payment?.payerName || order?.customerFullName || "--"}</strong></div>
                <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Telefone do pagamento</span><strong className="min-w-0 break-words text-right" style={{ color: "#1A1410" }}>{order?.payment?.payerPhone || order?.primaryPhoneNumber || "--"}</strong></div>
                <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Data</span><strong className="min-w-0 break-words text-right" style={{ color: "#1A1410" }}>{formatDate(order?.payment?.paymentDate || order?.paymentDate || order?.deliveryDate || order?.orderDate)}</strong></div>
                {isExternal ? <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Valor total pago</span><strong className="shrink-0 text-right" style={{ color: "#1A1410" }}>{formatMoney(orderVisibleTotal(order))}</strong></div> : null}
                {isExternal && order?.quote?.currency ? <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Moeda de compra</span><strong className="min-w-0 break-words text-right" style={{ color: "#1A1410" }}>{order.quote.currency}</strong></div> : null}
                {isExternal && (order?.quote?.exchangeRate ?? order?.exchangeRate) ? <div className="receipt-info-row flex items-start justify-between gap-4"><span className="min-w-0 break-words" style={{ color: "#6B7280" }}>Câmbio usado</span><strong className="min-w-0 break-words text-right" style={{ color: "#1A1410" }}>1 {order?.quote?.currency || "ZAR"} = {Number(order?.quote?.exchangeRate ?? order?.exchangeRate ?? 0).toFixed(2)} MZN</strong></div> : null}
              </div>
            </article>

            <article className="min-w-0 rounded-[24px] border p-4 sm:rounded-[28px] sm:p-5" style={{ borderColor: "#F2D4CC" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#9CA3AF" }}>Nota</p>
              <p className="mt-3 text-sm leading-6" style={{ color: "#6B7280" }}>
                Este recibo pode ser guardado em PDF pelo botao acima. No navegador, sera aberta a caixa de impressao e podes escolher a opcao Guardar como PDF.
              </p>
            </article>
          </div>
        </div>
      </section>

      <style jsx global>{`
        @media (max-width: 640px) {
          .receipt-items-table,
          .receipt-items-table thead,
          .receipt-items-table tbody,
          .receipt-items-table tr,
          .receipt-items-table th,
          .receipt-items-table td {
            display: block;
            width: 100%;
          }

          .receipt-items-table thead {
            display: none;
          }

          .receipt-items-table tr {
            padding: 0.75rem 0;
          }

          .receipt-items-table tr + tr {
            border-top: 1px solid #f2d4cc !important;
          }

          .receipt-items-table td {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.35rem 1rem;
            text-align: right;
            word-break: break-word;
          }

          .receipt-items-table td::before {
            content: attr(data-label);
            flex: 0 0 auto;
            max-width: 42%;
            text-align: left;
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            color: #9ca3af;
          }

          .receipt-items-table td[data-label="Item"] {
            display: block;
            text-align: left;
          }

          .receipt-items-table td[data-label="Item"]::before {
            display: block;
            max-width: 100%;
            margin-bottom: 0.25rem;
          }

          .receipt-info-row {
            flex-wrap: wrap;
          }
        }

        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          #receipt-sheet {
            box-shadow: none !important;
            border-color: #e5e7eb !important;
          }
        }
      `}</style>
    </div>
  );
}
