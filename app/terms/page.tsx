import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Termos de Uso — X Digital",
  description: "Condições gerais para usar os serviços de compra assistida internacional da X Digital (ShopeeX) em Moçambique. Direitos e responsabilidades do cliente e da plataforma.",
  openGraph: {
    title: "Termos de Uso — X Digital",
    description: "Tudo o que precisas de saber antes de usar os serviços de compra assistida internacional da X Digital em Moçambique.",
  },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Termos"
      title="Termos de Uso"
      description="Estes termos regulam a relação entre ti e a X Digital (ShopeeX Digital) no âmbito dos serviços de compra assistida internacional. Ao usar a plataforma, confirmas que leste, compreendeste e aceitaste todas as condições aqui descritas."
      updatedAt="23 de maio de 2026"
      sections={[
        {
          title: "1. Quem somos e o que fazemos",
          bodyLines: [
            "A X Digital (marca comercial: ShopeeX Digital) é uma plataforma moçambicana de compra assistida internacional. Actuamos como intermediários: recebemos os teus pedidos, pesquisamos produtos, preparamos cotações, processamos pagamentos e coordenamos a importação e entrega em Moçambique.",
            "Não somos uma loja. Não mantemos stock próprio dos produtos que compramos em teu nome. Somos um serviço de intermediação — o fornecedor final é sempre a loja ou marketplace internacional de onde o produto é adquirido.",
          ],
        },
        {
          title: "2. Registo e conta",
          items: [
            "Podes criar um pedido sem conta prévia. Nesse caso, podemos criar uma conta temporária associada ao teu telefone para acompanhamento.",
            "Para aceder ao histórico completo, submeter pagamentos e gerir pedidos activos, é necessário activar a conta definindo uma senha.",
            "Ao registares-te com Google, autorizas a X Digital a receber o teu email, nome e foto de perfil do Google.",
            "És responsável por manter as tuas credenciais em segurança. Não partilhes a tua senha com terceiros.",
            "Só é permitida uma conta por utilizador. Contas múltiplas criadas para contornar restrições podem ser suspensas.",
          ],
        },
        {
          title: "3. O processo de pedido",
          items: [
            "Submetes um pedido com link, foto, captura de ecrã ou descrição detalhada do produto pretendido.",
            "A X Digital analisa o pedido, verifica disponibilidade, calcula custos e emite uma cotação.",
            "Após aceitares a cotação e confirmares o pagamento, avançamos para a compra ao fornecedor.",
            "A confirmação de pagamento é sempre verificada manualmente ou por sistema antes de prosseguir com a encomenda.",
          ],
        },
        {
          title: "4. Cotação — o que é e o que não é",
          bodyLines: [
            "A cotação é uma estimativa de custo com base na informação disponível no momento da sua emissão. Inclui o preço do produto, taxas de serviço, custos de importação estimados e prazo de entrega indicativo.",
            "A cotação não constitui uma compra concluída nem uma reserva de stock. Preços de fornecedor, câmbio (USD/MZN), taxas alfandegárias e disponibilidade de stock podem mudar entre a emissão da cotação e a confirmação de pagamento.",
            "Quando uma cotação expira ou os valores mudam de forma significativa, emitimos uma nova cotação antes de prosseguir. Sempre notificaremos antes de cobrar um valor diferente do cotado.",
          ],
        },
        {
          title: "5. Pagamentos",
          items: [
            "Aceitamos M-Pesa, e-Mola, transferência bancária e outros meios indicados na plataforma no momento do pedido.",
            "Após submissão do comprovativo, o pagamento é verificado manualmente pela equipa da X Digital.",
            "Não processamos pedidos sem confirmação de pagamento válido. A X Digital não assume responsabilidade por valores enviados para contas ou números não indicados oficialmente pela plataforma.",
            "Em caso de falha de pagamento por parte do fornecedor ou cancelamento após pagamento confirmado, a X Digital devolve o valor pago conforme a política de reembolsos.",
          ],
        },
        {
          title: "6. Variação de preço e câmbio",
          bodyLines: [
            "Os produtos são adquiridos em moedas estrangeiras (USD, CNY, EUR, entre outras). O valor em meticais calculado na cotação é baseado no câmbio vigente na data de emissão.",
            "Se ocorrer variação cambial significativa (superior a 3%) entre a cotação e o momento da compra, a X Digital notificar-te-á e poderá emitir nova cotação. Tens o direito de cancelar sem penalização neste caso.",
          ],
        },
        {
          title: "7. Responsabilidades do cliente",
          items: [
            "Fornecer links correctos e confirmar tamanho, cor, modelo, quantidade e todas as variantes antes da compra.",
            "Garantir que o produto solicitado é legal em Moçambique, não viola direitos de propriedade intelectual e não está sujeito a restrições de importação.",
            "Manter telefone, email e morada actualizados para receber cotações, OTPs, confirmações de entrega e comunicações de suporte.",
            "Responder a pedidos de informação adicional (como declarações alfandegárias ou documentos de identificação) dentro dos prazos indicados.",
            "Não usar a plataforma para fins ilícitos, incluindo lavagem de dinheiro, contrafacção ou importação de produtos proibidos.",
          ],
        },
        {
          title: "8. Produtos proibidos e restritos",
          items: [
            "São proibidos: armas, munições, substâncias controladas, produtos falsificados, pornografia, produtos com origem sancionada e qualquer produto cuja importação seja proibida por lei moçambicana.",
            "São condicionados e requerem declaração prévia: medicamentos, suplementos, produtos electrónicos com potência acima dos limites legais e produtos alimentares perecíveis.",
            "A X Digital reserva-se o direito de recusar qualquer pedido sem necessidade de justificação detalhada quando houver suspeita de ilegalidade ou risco para a operação.",
          ],
        },
        {
          title: "9. Importação e alfândega",
          bodyLines: [
            "A X Digital actua como importador por conta do cliente. Os produtos são sujeitos às leis alfandegárias moçambicanas, incluindo o Código Aduaneiro (Decreto n.º 46/2002 e legislação subsequente). Taxas alfandegárias, IVA na importação e outros direitos aduaneiros são estimados na cotação mas podem variar conforme a classificação definitiva da mercadoria pelas autoridades.",
            "Em caso de retenção alfandegária por documentação incompleta ou classificação contestada, a X Digital envidará esforços para resolver a situação, mas não pode garantir a libertação da mercadoria nem se responsabiliza por taxas adicionais impostas pelas autoridades alfandegárias.",
            "Produtos retidos definitivamente pela alfândega por serem proibidos ou por incumprimento do cliente em fornecer documentação exigida não darão direito a reembolso do valor do produto.",
          ],
        },
        {
          title: "10. Prazos de entrega",
          bodyLines: [
            "Os prazos indicados nas cotações são estimativas baseadas nos prazos habituais do fornecedor, transportadora internacional, processo alfandegário e logística local. Não constituem garantias.",
            "A X Digital informa actualizações relevantes (chegada ao país, retenção alfandegária, saída para entrega) através das notificações da plataforma e/ou WhatsApp.",
            "Atrasos causados por eventos fora do controlo da X Digital (ver cláusula de força maior) não conferem direito a compensação, mas a X Digital compromete-se a manter o cliente informado e a explorar alternativas.",
          ],
        },
        {
          title: "11. Entrega local",
          items: [
            "A entrega é feita pelo estafeta designado pela X Digital na morada confirmada pelo cliente.",
            "O cliente deve confirmar a morada de entrega quando o pedido atingir o estado 'Chegou' ou 'Pronto para entrega'.",
            "Em caso de ausência na morada no momento da entrega, o estafeta tentará contactar o cliente. Se não for possível concluir a entrega, o pedido volta para a sede da X Digital e é agendada nova tentativa.",
            "Após duas tentativas falhadas por motivo imputável ao cliente (ausência, morada incorrecta, recusa de recepção), a X Digital pode cobrar taxa adicional de reentrega.",
          ],
        },
        {
          title: "12. Cancelamentos",
          bodyLines: [
            "Podes cancelar um pedido sem custo antes de confirmarmos o pagamento. Após confirmação de pagamento, o cancelamento está sujeito ao estado do pedido.",
            "A X Digital pode cancelar pedidos com dados falsos, produtos proibidos, comportamento abusivo, pagamento não confirmado dentro do prazo ou tentativa de fraude.",
          ],
          items: [
            "Cancelamento antes de pagamento confirmado: sem custo.",
            "Cancelamento após pagamento mas antes da compra ao fornecedor: reembolso total, deduzida taxa de processamento de 2,5% (mínimo 50 MZN).",
            "Cancelamento após compra ao fornecedor mas antes do envio: reembolso sujeito à política de devolução do fornecedor, deduzidas as taxas de serviço da X Digital.",
            "Cancelamento após envio internacional: não é possível cancelar. Aplicam-se as regras de devolução internacional.",
          ],
        },
        {
          title: "13. Reembolsos",
          bodyLines: [
            "Reembolsos aprovados são processados no prazo de 5 a 10 dias úteis após confirmação. O valor é devolvido pelo mesmo meio de pagamento usado na transacção original, salvo impossibilidade técnica.",
            "Não são reembolsáveis: taxas alfandegárias pagas, custos de envio internacional já incorridos, e valores de produtos retidos por alfândega devido a informação incorrecta fornecida pelo cliente.",
          ],
        },
        {
          title: "14. Produtos com defeito ou divergência",
          items: [
            "Se o produto recebido for diferente do descrito pelo fornecedor, deves reportar à X Digital no prazo de 48 horas após a recepção, com fotos detalhadas do produto e da embalagem.",
            "A X Digital analisará o caso e, conforme aplicável, abrirá disputa com o fornecedor, procederá à reentrega de produto correcto ou emitirá reembolso parcial ou total.",
            "Diferenças menores de cor devidas a calibrações de ecrã não constituem defeito ou divergência. Tamanhos devem ser sempre verificados na tabela do fornecedor antes do pedido.",
          ],
        },
        {
          title: "15. Limite de responsabilidade",
          bodyLines: [
            "A X Digital responde pelos seus actos enquanto intermediária: negligência no processo de cotação, falha em notificar alterações materiais de preço, ou erro nos dados de entrega imputável à plataforma.",
            "A X Digital não é responsável por: variações de preço ou câmbio após cotação aceite, atrasos de fornecedores ou transportadoras internacionais, retenções ou taxas alfandegárias, indisponibilidade de stock após compra, danos de produto causados no transporte internacional, ou informação incorrecta fornecida pelo cliente.",
            "Em qualquer caso, a responsabilidade máxima da X Digital perante um cliente por pedido não excederá o valor total pago por esse pedido.",
          ],
        },
        {
          title: "16. Força maior",
          body: "A X Digital não será responsabilizada por atrasos ou incumprimento causados por eventos fora do seu controlo razoável, incluindo: pandemias, catástrofes naturais, greves, suspensão de voos, bloqueios alfandegários por política governamental, guerras, sanções internacionais ou falha de infraestrutura crítica de telecomunicações ou energia. Em caso de força maior, a X Digital notificará os clientes afectados o mais rapidamente possível e explorará alternativas dentro do possível.",
        },
        {
          title: "17. Prevenção de fraude",
          bodyLines: [
            "A X Digital monitoriza activamente tentativas de fraude, incluindo comprovativos de pagamento falsificados, uso de múltiplas contas para contornar limites, e pedidos com dados de entrega inconsistentes.",
            "Contas com comportamento fraudulento são suspensas permanentemente e os casos podem ser reportados às autoridades competentes. Valores obtidos por fraude serão reclamados por vias legais.",
          ],
        },
        {
          title: "18. Propriedade intelectual",
          body: "Todo o conteúdo da plataforma X Digital — incluindo marca, logótipo, design, textos, imagens e código — é propriedade da X Digital ou de seus licenciantes. Não podes reproduzir, distribuir ou criar obras derivadas sem autorização escrita prévia.",
        },
        {
          title: "19. Modificações ao serviço e aos termos",
          bodyLines: [
            "A X Digital pode modificar funcionalidades, preços de serviço, prazos operacionais ou processos com notificação prévia de 15 dias para alterações materiais.",
            "A continuação do uso da plataforma após o período de notificação constitui aceitação das alterações. Para alterações de preço de serviço que afectem pedidos em curso, a X Digital aplicará o preço anterior até à conclusão desses pedidos.",
          ],
        },
        {
          title: "20. Suspensão e encerramento de conta",
          items: [
            "A X Digital pode suspender ou encerrar contas por: violação destes termos, comportamento abusivo para com a equipa, fornecimento de informação falsa, tentativa de fraude ou inactividade prolongada.",
            "Podes encerrar a tua conta a qualquer momento contactando o suporte. Pedidos em curso serão concluídos conforme o estado em que se encontram.",
            "Após encerramento, os teus dados são retidos pelo período mínimo exigido por lei, conforme descrito na Política de Privacidade.",
          ],
        },
        {
          title: "21. Lei aplicável e resolução de litígios",
          bodyLines: [
            "Estes termos são regidos pelas leis da República de Moçambique, nomeadamente a Lei n.º 22/2009 de Defesa do Consumidor, o Código Civil e demais legislação aplicável.",
            "Em caso de litígio, as partes comprometem-se a tentar resolução amigável no prazo de 30 dias. Não sendo possível, são competentes os tribunais da cidade de Maputo, Moçambique, com renúncia a qualquer outro foro.",
          ],
        },
        {
          title: "22. Contacto",
          body: "Para questões sobre estes termos, disputas de pedidos ou qualquer outra questão relacionada com o serviço: suporte@xdigital.co.mz ou contacta-nos via WhatsApp através do número indicado na plataforma.",
        },
      ]}
      cta={{ label: "Ver política de privacidade", href: "/privacy" }}
    />
  );
}
