"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, apiFetch } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";

const RED = "#EE4D2D";
const SUPPORT_WHATSAPP = "https://wa.me/258842161000";

type CustomerQuote = {
  productAmountMzn?: number | null;
  shippingAmountMzn?: number | null;
  customsAmountMzn?: number | null;
  riskReserveAmountMzn?: number | null;
  operationalCostAmountMzn?: number | null;
  siteFeeAmountMzn?: number | null;
  localDeliveryAmountMzn?: number | null;
  finalAmountMzn?: number | null;
  finalAmountWithDeliveryMzn?: number | null;
  currency?: string | null;
  exchangeRate?: number | null;
  quotedAt?: string | null;
  routeName?: string | null;
  estimatedDays?: string | null;
  productAmountOrigin?: number | null;
  shippingAmountOrigin?: number | null;
  customsPercent?: number | null;
  riskPercent?: number | null;
  sitePercent?: number | null;
};

type PublicQuote = {
  orderId: number;
  code: string;
  status: string;
  sourceStore?: string | null;
  storeLabel?: string | null;
  productUrl?: string | null;
  productDescription?: string | null;
  productDetails?: string | null;
  cleanedTitle?: string | null;
  quantity?: number | null;
  detectedLinks?: string[];
  screenshotUrls?: string[];
  quote?: CustomerQuote | null;
  totalFinalMzn?: number | null;
  estimatedDeliveryTime?: number | null;
  teamNote?: string | null;
  quoteSentAt?: string | null;
  quoteTokenExpiresAt?: string | null;
  quoteAcceptedAt?: string | null;
  quoteRejectedAt?: string | null;
  quoteRejectedReason?: string | null;
  paymentUrl?: string | null;
};

const PAYMENT_BLOCKED_STATUSES = new Set([
  "CANCELLED",
  "DELIVERED",
  "REFUNDED",
  "PAYMENT_CANCELLED",
  "ORDER_CANCELLED_BY_CUSTOMER",
]);

function isPaymentBlockedStatus(status?: string | null) {
  return PAYMENT_BLOCKED_STATUSES.has(String(status ?? "").toUpperCase());
}

function row(label: string, value?: number | null) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <strong className="text-right text-sm text-slate-950">{formatMoney(value ?? 0)}</strong>
    </div>
  );
}

export default function PublicQuotePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = params.code;
  const token = searchParams.get("token") || "";
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"accept" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const loadQuote = useCallback(async () => {
    if (!code || !token) {
      setError("Link de cotacao invalido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<PublicQuote>(`public/quotes/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`);
      setQuote(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nao foi possivel abrir esta cotacao.");
    } finally {
      setLoading(false);
    }
  }, [code, token]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  const whatsappHref = useMemo(() => {
    const message = quote
      ? `Ola, estou a ver a cotacao ${quote.code} e preciso de ajuda.`
      : "Ola, preciso de ajuda com uma cotacao.";
    return `${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
  }, [quote]);

  async function acceptQuote() {
    if (!quote) return;
    setWorking("accept");
    setError("");
    try {
      const updated = await apiFetch<PublicQuote>(
        `public/quotes/${encodeURIComponent(quote.code)}/accept?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      setQuote(updated);
      if (isPaymentBlockedStatus(updated.status)) {
        setError("Este pedido foi cancelado e já não permite pagamento.");
        return;
      }
      router.push(updated.paymentUrl || `/orders/${updated.orderId}/payment`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nao foi possivel aceitar a cotacao.");
    } finally {
      setWorking(null);
    }
  }

  async function rejectQuote() {
    if (!quote) return;
    setWorking("reject");
    setError("");
    try {
      const updated = await apiFetch<PublicQuote>(
        `public/quotes/${encodeURIComponent(quote.code)}/reject?token=${encodeURIComponent(token)}`,
        { method: "POST", body: JSON.stringify({ reason: rejectReason }) }
      );
      setQuote(updated);
      setRejectOpen(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nao foi possivel recusar a cotacao.");
    } finally {
      setWorking(null);
    }
  }

  const q = quote?.quote;
  const paymentBlocked = isPaymentBlockedStatus(quote?.status);
  const accepted = !paymentBlocked && (quote?.quoteAcceptedAt || quote?.status === "PENDING_PAYMENT");
  const rejected = quote?.quoteRejectedAt || quote?.status === "FAILED";
  const canDecide = quote?.status === "QUOTED" && !accepted && !rejected;

  return (
    <main className="min-h-screen bg-[#FFF7F3]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
        <Link href="/" className="w-fit text-sm font-black" style={{ color: RED }}>ShopeeMz</Link>

        {loading ? (
          <div className="rounded-lg bg-white p-8 text-sm font-bold text-slate-600 shadow-sm">A carregar cotacao...</div>
        ) : error && !quote ? (
          <div className="rounded-lg bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-black text-slate-950">Cotacao indisponivel</h1>
            <p className="mt-3 text-sm font-semibold text-slate-600">{error}</p>
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-md px-4 py-3 text-sm font-black text-white" style={{ background: RED }}>
              Falar com a equipa no WhatsApp
            </a>
          </div>
        ) : quote ? (
          <>
            <div className="rounded-lg bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: RED }}>Cotacao ShopeeMz</p>
                  <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{quote.code}</h1>
                  <p className="mt-2 text-sm font-semibold text-slate-600">
                    {quote.storeLabel || quote.sourceStore || "Loja externa"}{quote.quantity ? ` · Quantidade ${quote.quantity}` : ""}
                  </p>
                </div>
                <div className="rounded-md bg-slate-950 px-4 py-3 text-white">
                  <p className="text-xs font-bold text-slate-300">Total final</p>
                  <p className="text-xl font-black">{formatMoney(quote.totalFinalMzn ?? q?.finalAmountWithDeliveryMzn ?? q?.finalAmountMzn ?? 0)}</p>
                </div>
              </div>

              {accepted ? <p className="mt-5 rounded-md bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Cotacao aceite. Podes continuar para pagamento.</p> : null}
              {paymentBlocked ? <p className="mt-5 rounded-md bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">Pedido cancelado. Este pedido foi cancelado e já não permite pagamento.</p> : null}
              {rejected ? <p className="mt-5 rounded-md bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">Cotacao recusada{quote.quoteRejectedReason ? `: ${quote.quoteRejectedReason}` : "."}</p> : null}
              {error ? <p className="mt-5 rounded-md bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <div className="rounded-lg bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-black text-slate-950">Produto</h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                    {quote.cleanedTitle || quote.productDescription || "Produto externo solicitado"}
                  </p>
                  {quote.productDetails ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{quote.productDetails}</p> : null}
                  {quote.productUrl ? <a href={quote.productUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-black" style={{ color: RED }}>Abrir link do produto</a> : null}
                </div>

                {quote.screenshotUrls && quote.screenshotUrls.length > 0 ? (
                  <div className="rounded-lg bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-black text-slate-950">Fotos enviadas</h2>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {quote.screenshotUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Imagem do pedido" className="h-36 w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <aside className="space-y-6">
                <div className="rounded-lg bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-black text-slate-950">Breakdown</h2>
                  <div className="mt-3">
                    {row(q?.productAmountOrigin && q?.currency ? `Produto (${q.productAmountOrigin} ${q.currency})` : "Produto convertido", q?.productAmountMzn)}
                    {row(q?.shippingAmountOrigin && q?.currency ? `Transporte ${q?.routeName || "Africa do Sul -> Maputo"} (${q.shippingAmountOrigin} ${q.currency})` : `Transporte ${q?.routeName || "Africa do Sul -> Maputo"}`, q?.shippingAmountMzn)}
                    {row(q?.riskPercent != null ? `Reserva de risco (${q.riskPercent}%)` : "Reserva de risco", q?.riskReserveAmountMzn)}
                    {row(q?.customsPercent != null ? `Alfandega (${q.customsPercent}%)` : "Taxa operacional", q?.customsAmountMzn ?? q?.operationalCostAmountMzn)}
                    {row(q?.sitePercent != null ? `Servico ShopeeMz (${q.sitePercent}%)` : "Taxa do site", q?.siteFeeAmountMzn)}
                    {row("Entrega local", q?.localDeliveryAmountMzn)}
                  </div>
                  <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-white">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-bold text-slate-300">Total</span>
                      <strong className="text-lg">{formatMoney(quote.totalFinalMzn ?? q?.finalAmountWithDeliveryMzn ?? q?.finalAmountMzn ?? 0)}</strong>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
                    <p>Validade: {formatDate(quote.quoteTokenExpiresAt)}</p>
                    {q?.estimatedDays ? <p>Prazo estimado: {q.estimatedDays}</p> : quote.estimatedDeliveryTime ? <p>Prazo estimado: {quote.estimatedDeliveryTime} dias</p> : null}
                    {q?.currency || q?.exchangeRate ? <p>Moeda: {q.currency || "ZAR"} · Cambio: {Number(q.exchangeRate || 0).toFixed(2)} MZN</p> : null}
                  </div>
                </div>

                {quote.teamNote ? (
                  <div className="rounded-lg bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-black text-slate-950">Observacao da equipa</h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{quote.teamNote}</p>
                  </div>
                ) : null}

                <div className="rounded-lg bg-white p-5 shadow-sm sm:p-6">
                  <div className="grid gap-3">
                    {canDecide ? (
                      <>
                        <button onClick={acceptQuote} disabled={working !== null} className="rounded-md px-4 py-3 text-sm font-black text-white disabled:opacity-60" style={{ background: RED }}>
                          {working === "accept" ? "A aceitar..." : "Aceitar cotacao"}
                        </button>
                        <button onClick={() => setRejectOpen(true)} disabled={working !== null} className="rounded-md border border-slate-200 px-4 py-3 text-sm font-black text-slate-800 disabled:opacity-60">
                          Recusar cotacao
                        </button>
                      </>
                    ) : accepted ? (
                      <Link href={quote.paymentUrl || `/orders/${quote.orderId}/payment`} className="rounded-md px-4 py-3 text-center text-sm font-black text-white" style={{ background: RED }}>
                        Continuar pagamento
                      </Link>
                    ) : null}
                    <a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 px-4 py-3 text-center text-sm font-black text-slate-800">
                      Falar com a equipa no WhatsApp
                    </a>
                  </div>
                </div>
              </aside>
            </div>

            {rejectOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                  <h2 className="text-lg font-black text-slate-950">Recusar cotacao</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Podes deixar um motivo para a equipa ajustar a proposta.</p>
                  <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={4} className="mt-4 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-orange-400" placeholder="Motivo opcional" />
                  <div className="mt-4 flex justify-end gap-3">
                    <button onClick={() => setRejectOpen(false)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Voltar</button>
                    <button onClick={rejectQuote} disabled={working !== null} className="rounded-md px-4 py-2 text-sm font-black text-white disabled:opacity-60" style={{ background: RED }}>
                      {working === "reject" ? "A recusar..." : "Confirmar recusa"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
