import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8f5] px-4">
      <section className="w-full max-w-2xl rounded-[28px] border border-[rgba(232,67,26,0.10)] bg-white p-8 shadow-[0_24px_80px_rgba(80,34,14,0.08)]">
        <h1 className="text-3xl font-black text-[#1A1410]">Privacidade</h1>
        <p className="mt-4 text-sm leading-7 text-[#6B7280]">
          Os teus dados sao usados para autenticacao, contacto, notificacoes, pagamentos e acompanhamento de pedidos. A ShopeeX Digital trata estas informacoes apenas no contexto operacional da tua conta e das tuas compras.
        </p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-bold text-[#E8431A] hover:underline">
          Voltar
        </Link>
      </section>
    </main>
  );
}
