import Link from "next/link";
import { Logo } from "@/components/logo";
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#FFF8F5] px-5 py-10 text-[#1A1410] sm:px-8">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-[#F1D4CB] bg-white p-8 shadow-[0_30px_80px_rgba(232,67,26,0.08)] sm:p-10">
        <Logo />
        <h1 className="mt-8 text-3xl font-black">Termos de Uso</h1>
        <div className="mt-6 space-y-5 text-sm leading-8 text-[#5E4C45]">
          <p>Ao usar a ShopeeX Digital, concordas em fornecer dados corretos, acompanhar os estados do pedido e respeitar os prazos informados durante cotacao, pagamento e entrega.</p>
          <p>Os valores apresentados podem incluir produto, margem de servico, taxas operacionais e entrega, conforme o tipo de pedido e a politica comercial ativa no momento da compra.</p>
          <p>Pagamentos submetidos ficam sujeitos a validacao antes da confirmacao definitiva do pedido. A plataforma pode solicitar comprovativos adicionais sempre que necessario.</p>
          <p>Ao criar conta, aceitas receber comunicacoes operacionais relacionadas aos teus pedidos, pagamentos, notificacoes de rastreamento e suporte.</p>
        </div>
        <Link href="/login?tab=register" className="mt-8 inline-flex rounded-2xl bg-[#E8431A] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#CC3315]">
          Voltar ao cadastro
        </Link>
      </div>
    </main>
  );
}
