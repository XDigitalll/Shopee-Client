import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politica de Entrega",
  description: "Como funcionam entregas ShopeeX Digital em Maputo e provincias.",
};

export default function DeliveryPolicyPage() {
  return (
    <LegalPage
      eyebrow="Entrega"
      title="Politica de Entrega"
      description="A entrega depende do tipo de pedido, disponibilidade local, chegada internacional e morada confirmada pelo cliente."
      updatedAt="23 de maio de 2026"
      sections={[
        {
          title: "Maputo",
          body: "Em Maputo, podemos entregar ao domicilio quando a morada esta confirmada e o pedido esta pronto para entrega. O cliente deve manter telefone e WhatsApp activos para coordenacao.",
        },
        {
          title: "Provincias",
          body: "Para provincias, a entrega pode ser feita por parceiros logisticos, transporte indicado pelo cliente ou outro metodo combinado com a equipa. Custos e prazos sao confirmados antes do envio.",
        },
        {
          title: "Prazos estimados",
          items: [
            "Pedidos locais dependem de disponibilidade e confirmacao de pagamento.",
            "Pedidos internacionais dependem da loja fornecedora, transporte internacional, alfandega e recepcao local.",
            "Prazos apresentados sao estimativas e podem mudar por factores fora do controlo da ShopeeX.",
          ],
        },
        {
          title: "Custos de entrega",
          body: "Custos de entrega podem variar conforme zona, urgencia, peso, volume, transportadora e tentativa adicional. O valor e informado na cotacao, no pedido ou antes da entrega.",
        },
        {
          title: "Tentativas falhadas",
          items: [
            "Se o cliente nao atender, nao estiver disponivel ou a morada estiver incorrecta, uma nova tentativa pode ter custo adicional.",
            "Se a falha for da operacao ShopeeX ou do estafeta, faremos nova coordenacao sem custo adicional quando aplicavel.",
            "Pedidos nao reclamados durante muito tempo podem ser arquivados conforme contacto previo com o cliente.",
          ],
        },
      ]}
      cta={{ label: "Ver reembolsos", href: "/refunds" }}
    />
  );
}
