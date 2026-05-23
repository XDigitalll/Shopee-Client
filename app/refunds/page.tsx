import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Reembolsos e Cancelamentos",
  description: "Regras simples de cancelamento e reembolso para pedidos ShopeeMz.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      eyebrow="Reembolsos"
      title="Politica de Reembolso e Cancelamento"
      description="Queremos que saibas em que momentos podes cancelar, quando o reembolso e possivel e o que acontece quando o produto ja foi comprado ao fornecedor."
      updatedAt="23 de maio de 2026"
      sections={[
        {
          title: "Antes da cotacao",
          body: "Podes cancelar um pedido antes de receber ou aceitar a cotacao. Se ainda nao houve pagamento, nao existe valor a reembolsar.",
        },
        {
          title: "Depois da cotacao e antes do pagamento",
          body: "Se nao concordares com a cotacao, podes simplesmente nao avançar. O pedido pode ser arquivado sem custo.",
        },
        {
          title: "Depois do pagamento",
          items: [
            "Se ainda nao compramos o produto ao fornecedor, podemos cancelar e reembolsar o valor pago, descontando custos bancarios ou operacionais quando existirem.",
            "Se o produto ja foi comprado, o cancelamento depende das regras da loja fornecedora e do estado do envio.",
            "Se houver diferenca de cambio, taxa ou custo logistico ja confirmado, o reembolso pode ser parcial.",
          ],
        },
        {
          title: "Produto ja comprado ao fornecedor",
          body: "Quando a compra internacional ja foi feita, a ShopeeMz fica sujeita as politicas do fornecedor, transportadora e plataforma de origem. Se o fornecedor aceitar devolucao ou cancelamento, ajudamos a conduzir o processo.",
        },
        {
          title: "Casos elegiveis para reembolso",
          items: [
            "Produto indisponivel depois do pagamento e antes da compra.",
            "Pagamento confirmado em duplicado.",
            "Pedido cancelado pela ShopeeMz por impossibilidade operacional antes da compra.",
            "Falha de entrega causada por erro comprovado da nossa operacao, quando nao for possivel nova entrega.",
          ],
        },
        {
          title: "Falha na entrega",
          body: "Se a entrega falhar por endereco errado, telefone indisponivel ou ausencia do cliente, podem existir custos adicionais para nova tentativa. Se a falha for nossa, avaliamos nova entrega ou reembolso conforme o caso.",
        },
      ]}
      cta={{ label: "Ver politica de entrega", href: "/delivery-policy" }}
    />
  );
}
