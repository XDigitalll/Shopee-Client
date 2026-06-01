import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { PAYMENT_SUPPORT_MESSAGE, SUPPORT_EMAIL, SUPPORT_WHATSAPP_LABEL, SUPPORT_WHATSAPP_URL } from "@/lib/support-contacts";

export const metadata: Metadata = {
  title: "Contactos",
  description: "Contactos e horarios de atendimento da ShopeeMz.",
};

const contacts = [
  { title: "WhatsApp", value: SUPPORT_WHATSAPP_LABEL, detail: "Ideal para cotacoes, actualizacoes e suporte rapido.", href: SUPPORT_WHATSAPP_URL },
  { title: "Email", value: SUPPORT_EMAIL, detail: "Para pedidos formais, privacidade, reembolsos e suporte de conta.", href: `mailto:${SUPPORT_EMAIL}` },
  { title: "Horario", value: "Segunda a sexta, 08h-18h", detail: "Pedidos podem ser enviados online a qualquer momento." },
  { title: "ShopeeMz", value: "Maputo, Mocambique", detail: "Operacao digital focada em compra assistida internacional." },
];

export default function ContactPage() {
  return (
    <>
      <main className="min-h-screen bg-[#FFF8F5] px-4 py-6 text-[#1A1410] sm:px-6 lg:py-10">
        <div className="mx-auto max-w-5xl">
          <header className="mb-6 flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex">
              <Logo size="md" />
            </Link>
            <Link href="/orders/external/new" className="rounded-2xl bg-[#E8431A] px-4 py-2.5 text-sm font-black text-white">
              Fazer pedido
            </Link>
          </header>

          <section className="rounded-[28px] border border-[#F2D4CC] bg-white p-6 shadow-[0_24px_80px_rgba(80,34,14,0.08)] sm:p-8 lg:p-10">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#E8431A]">Contacto</p>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">Fala com a ShopeeMz</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6B7280] sm:text-base">
              Estamos aqui para ajudar com cotacoes, pagamentos, entregas, acesso a conta e pedidos de privacidade.
            </p>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            {contacts.map((item) => (
              <article key={item.title} className="rounded-[24px] border border-[#F2D4CC] bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#E8431A]">{item.title}</p>
                {"href" in item ? (
                  <a href={item.href} target={item.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="mt-2 block text-xl font-black hover:text-[#E8431A]">
                    {item.value}
                  </a>
                ) : (
                  <h2 className="mt-2 text-xl font-black">{item.value}</h2>
                )}
                <p className="mt-3 text-sm leading-7 text-[#6B7280]">{item.detail}</p>
              </article>
            ))}
          </section>

          <section className="mt-5 rounded-[24px] border border-[#BFE8C9] bg-[#F0FDF4] p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#15803D]">WhatsApp ShopeeMz</p>
            <h2 className="mt-2 text-2xl font-black text-[#14532D]">+258 86 469 8775</h2>
            <p className="mt-3 text-sm leading-7 text-[#166534]">
              Em breve poderás consultar pedidos, receber cotações e acompanhar entregas diretamente pelo WhatsApp.
            </p>
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-2xl bg-[#16A34A] px-5 py-3 text-sm font-black text-white">
              Falar pelo WhatsApp
            </a>
          </section>

          <section className="mt-5 rounded-[24px] border border-[#F8C7B8] bg-[#FFF0EC] p-5 sm:p-6">
            <h2 className="text-lg font-black">Antes de contactar</h2>
            <p className="mt-2 text-sm leading-7 text-[#6B7280]">
              Se o assunto for sobre um pedido, envia a referencia, telefone da conta e uma descricao curta do que precisas. Nunca envies senhas completas.
            </p>
            <p className="mt-2 text-sm font-bold leading-7 text-[#991B1B]">{PAYMENT_SUPPORT_MESSAGE}</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
