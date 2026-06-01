import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { PAYMENT_SUPPORT_MESSAGE, SUPPORT_EMAIL, SUPPORT_WHATSAPP_LABEL, SUPPORT_WHATSAPP_URL } from "@/lib/support-contacts";

export const metadata: Metadata = {
  title: "Como Funciona",
  description: "Passo a passo da compra assistida internacional na ShopeeMz.",
};

const steps = [
  { title: "Enviar link ou foto", text: "Colas o link da loja, descreves o produto ou anexas screenshot." },
  { title: "Recebemos o pedido", text: "A tua referencia e criada e podes acompanhar o estado." },
  { title: "Analise", text: "A equipa verifica produto, variantes, disponibilidade e riscos." },
  { title: "Cotacao", text: "Recebes preco final estimado, taxas, prazo e forma de pagamento." },
  { title: "Pagamento", text: `Depois de confirmares, validamos o pagamento com seguranca. ${PAYMENT_SUPPORT_MESSAGE}` },
  { title: "Compra internacional", text: "Compramos ao fornecedor e acompanhamos ate chegar." },
  { title: "Entrega", text: "Confirmamos morada e coordenamos entrega em Maputo ou provincias." },
];

const trustCards = [
  "Referencia para cada pedido",
  "Conta temporaria para acompanhar sem burocracia",
  "Notificacoes por canais digitais",
  "Cotacao antes de qualquer compra",
];

export default function HowItWorksPage() {
  return (
    <>
      <main className="min-h-screen bg-[#FFF8F5] px-4 py-6 text-[#1A1410] sm:px-6 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-6 flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex">
              <Logo size="md" />
            </Link>
            <Link href="/orders/external/new" className="rounded-2xl bg-[#E8431A] px-4 py-2.5 text-sm font-black text-white">
              Comecar agora
            </Link>
          </header>

          <section className="overflow-hidden rounded-[28px] border border-[#F2D4CC] bg-white shadow-[0_24px_80px_rgba(80,34,14,0.08)]">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-6 sm:p-8 lg:p-10">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#E8431A]">Como funciona</p>
                <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
                  Compra internacional com acompanhamento local
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6B7280] sm:text-base">
                  A ShopeeMz simplifica compras em lojas como SHEIN, TEMU, Amazon e AliExpress. Tu envias o pedido, nos analisamos, cotamos, compramos e acompanhamos ate a entrega.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/orders/external/new" className="rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-black text-white">
                    Enviar pedido
                  </Link>
                  <Link href="/contact" className="rounded-2xl border border-[#F2D4CC] bg-white px-5 py-3 text-sm font-black text-[#E8431A]">
                    Tirar duvidas
                  </Link>
                </div>
              </div>
              <div className="grid content-center gap-3 bg-[#1A1410] p-6 text-white sm:p-8">
                {trustCards.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-3">
            {steps.map((step, index) => (
              <article key={step.title} className="grid gap-3 rounded-[24px] border border-[#F2D4CC] bg-white p-5 shadow-sm sm:grid-cols-[70px_1fr] sm:items-center">
                <div className="flex items-center gap-3 sm:block">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EC] text-sm font-black text-[#E8431A]">
                    {index + 1}
                  </span>
                  {index < steps.length - 1 ? <span className="hidden h-8 w-px bg-[#F2D4CC] sm:mx-auto sm:mt-3 sm:block" /> : null}
                </div>
                <div>
                  <h2 className="text-lg font-black">{step.title}</h2>
                  <p className="mt-1 text-sm leading-7 text-[#6B7280]">{step.text}</p>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-5 rounded-[24px] border border-[#F8C7B8] bg-[#FFF0EC] p-5 sm:p-6">
            <h2 className="text-lg font-black">Suporte de pagamento</h2>
            <p className="mt-2 text-sm leading-7 text-[#6B7280]">{PAYMENT_SUPPORT_MESSAGE}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="rounded-2xl bg-[#16A34A] px-5 py-3 text-sm font-black text-white">
                WhatsApp: {SUPPORT_WHATSAPP_LABEL}
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-2xl border border-[#F2D4CC] bg-white px-5 py-3 text-sm font-black text-[#E8431A]">
                Email: {SUPPORT_EMAIL}
              </a>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
