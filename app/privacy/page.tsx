import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Política de Privacidade — X Digital",
  description: "Como a X Digital (ShopeeX) recolhe, usa, protege e trata dados pessoais de clientes em Moçambique. Direitos de acesso, correcção e eliminação conforme a Lei n.º 1/2021.",
  openGraph: {
    title: "Política de Privacidade — X Digital",
    description: "Transparência total sobre como gerimos os teus dados pessoais no âmbito dos serviços de compra assistida internacional da X Digital.",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacidade"
      title="Política de Privacidade"
      description="A X Digital trata os teus dados com responsabilidade e transparência. Esta política explica quais dados recolhemos, porque precisamos deles, com quem partilhamos e como podes exercer os teus direitos — em conformidade com a Lei n.º 1/2021 de Protecção de Dados Pessoais de Moçambique."
      updatedAt="23 de maio de 2026"
      sections={[
        {
          title: "1. Quem somos",
          body: "A X Digital (operada sob a marca ShopeeX Digital) é uma plataforma moçambicana de compra assistida internacional. Actuamos como responsáveis pelo tratamento dos dados pessoais que recolhemos no âmbito dos nossos serviços. Contacto: suporte@xdigital.co.mz.",
        },
        {
          title: "2. Dados que recolhemos",
          items: [
            "Identificação e contacto: nome, número de telefone, endereço de email, foto de perfil (quando usas o login com Google).",
            "Dados de conta: senha cifrada, data de criação, histórico de sessões, preferências de notificação.",
            "Contas temporárias: quando crias um pedido sem conta prévia, podemos criar automaticamente uma conta ligada ao teu telefone para acompanhamento do pedido.",
            "Dados de pedido: links, capturas de ecrã, descrições, fotos, variantes, quantidades, referências de produto e histórico de pedidos.",
            "Dados de entrega: morada, bairro, cidade, referência de localização, link Google Maps e instruções específicas ao estafeta.",
            "Dados de pagamento: valor, método (M-Pesa, e-Mola, transferência bancária ou outros meios suportados), referência de transacção, comprovativo de pagamento e hora de submissão.",
            "Dados de navegação: endereço IP, tipo de browser, sistema operativo e páginas visitadas — usados exclusivamente para segurança e melhoria do serviço.",
          ],
        },
        {
          title: "3. Como recolhemos os dados",
          items: [
            "Directamente por ti: formulários de registo, pedidos, pagamentos, actualizações de perfil e mensagens de suporte.",
            "Via Google OAuth: quando escolhes 'Entrar com Google', recebemos o teu email, nome e foto de perfil conforme autorizado pelo Google.",
            "Automaticamente: ao usares a plataforma, dados técnicos mínimos são registados para segurança e diagnóstico.",
            "Via WhatsApp ou Telegram: quando contactas o suporte por esses canais, as mensagens podem ser guardadas para acompanhamento do pedido.",
          ],
        },
        {
          title: "4. Para que usamos os dados",
          items: [
            "Criar e gerir a tua conta, autenticar sessões e garantir que és o titular do pedido.",
            "Analisar produtos solicitados, preparar cotações, comprar ao fornecedor e acompanhar estados do pedido.",
            "Processar e validar pagamentos, emitir comprovativos e registar o histórico financeiro do pedido.",
            "Coordenar a entrega: atribuição de estafeta, confirmação de morada, rastreamento e confirmação de recepção.",
            "Enviar actualizações de estado, alertas de pagamento, códigos OTP de confirmação e mensagens de suporte.",
            "Prevenir fraude, detectar comportamento abusivo, resolver disputas e cumprir obrigações legais e regulatórias.",
            "Melhorar a plataforma: análise de padrões de uso agregados e anonimizados para desenvolvimento de produto.",
          ],
        },
        {
          title: "5. Contas temporárias",
          bodyLines: [
            "Quando submetes um pedido sem criar conta, podemos gerar automaticamente uma conta temporária associada ao número de telefone fornecido. Esta conta serve para te permitir acompanhar o estado do pedido, receber notificações e aceder ao histórico.",
            "Após o pedido, podes reivindicar esta conta definindo uma senha e completando o perfil. A conta temporária permanece activa até pedires a sua eliminação ou até um período de inactividade de 24 meses.",
          ],
        },
        {
          title: "6. OTP, autenticação e recuperação de acesso",
          bodyLines: [
            "Podemos usar SMS, WhatsApp, Telegram ou email para enviar códigos de confirmação (OTP), links de recuperação de conta e alertas de segurança sobre actividade suspeita.",
            "A X Digital nunca te pedirá a senha completa por chamada telefónica, mensagem de texto ou email. Qualquer pedido deste tipo é fraudulento — reporta imediatamente ao suporte.",
          ],
        },
        {
          title: "7. Partilha de dados com terceiros",
          items: [
            "Fornecedores de produto: partilhamos apenas os dados estritamente necessários para concluir a compra (morada de entrega, variante, quantidade). Não partilhamos dados de pagamento locais.",
            "Transportadoras e estafetas: morada de entrega, número de telefone de contacto e referências necessárias para a entrega.",
            "Supabase: utilizado para armazenamento seguro de imagens, capturas de ecrã e ficheiros relacionados aos pedidos.",
            "Serviços de email e notificação: processam dados apenas para entregar mensagens transaccionais em nome da X Digital.",
            "N8N e automações internas: podem processar dados de pedido para acções automáticas de acompanhamento e notificação, operando exclusivamente em nome da X Digital.",
            "Autoridades competentes: partilhamos dados quando legalmente obrigados, nomeadamente perante a Autoridade Tributária de Moçambique (ATM), Ministério Público ou tribunal com competência.",
          ],
        },
        {
          title: "8. Transferências internacionais de dados",
          body: "Alguns serviços que utilizamos (como Supabase ou serviços de email) podem processar dados em servidores fora de Moçambique. Em todos os casos, exigimos que esses serviços apliquem medidas de protecção equivalentes às da legislação moçambicana vigente.",
        },
        {
          title: "9. Retenção de dados",
          items: [
            "Dados de conta activa: mantidos durante toda a vigência da conta e por 5 anos após o encerramento, para fins de auditoria e obrigações fiscais.",
            "Dados de pedidos e pagamentos: retidos por um mínimo de 5 anos após a conclusão ou cancelamento do pedido, conforme exigências fiscais e de resolução de disputas.",
            "Comprovativos de pagamento: retidos por 7 anos para conformidade fiscal e defesa em disputas.",
            "Dados de contas temporárias sem actividade: eliminados após 24 meses de inactividade, salvo pedido de activação anterior.",
            "Logs de segurança: retidos por 12 meses para prevenção de fraude e investigação de incidentes.",
          ],
        },
        {
          title: "10. Segurança dos dados",
          bodyLines: [
            "Implementamos medidas técnicas e organizacionais para proteger os teus dados: senhas cifradas com algoritmos modernos (bcrypt), sessões com tokens seguros, acesso interno restrito ao princípio do mínimo privilégio, e comunicações via HTTPS.",
            "Comprovativos de pagamento e documentos sensíveis são armazenados com controlo de acesso adicional. Em caso de incidente de segurança que afecte dados pessoais, notificaremos os utilizadores afectados no prazo máximo de 72 horas após tomada de conhecimento.",
          ],
        },
        {
          title: "11. Cookies e tecnologias similares",
          body: "Utilizamos cookies essenciais para manter a tua sessão activa e garantir o funcionamento da plataforma. Não utilizamos cookies de rastreamento para publicidade de terceiros. Podes gerir cookies nas definições do teu browser, mas desactivar cookies essenciais pode impedir o acesso à plataforma.",
        },
        {
          title: "12. Dados de menores",
          body: "Os nossos serviços destinam-se a utilizadores com 18 anos ou mais. Não recolhemos intencionalmente dados de menores. Se tomarmos conhecimento de que recolhemos dados de um menor sem consentimento dos pais ou responsáveis legais, eliminaremos esses dados imediatamente.",
        },
        {
          title: "13. Os teus direitos",
          items: [
            "Acesso: podes solicitar uma cópia dos dados pessoais que guardamos sobre ti.",
            "Correcção: podes pedir a correcção de dados incorrectos ou desactualizados (nome, telefone, email, morada).",
            "Eliminação: podes pedir a eliminação dos teus dados, salvo quando a retenção for obrigatória por lei ou necessária para resolução de disputas em curso.",
            "Portabilidade: podes solicitar os teus dados num formato estruturado e legível por máquina.",
            "Oposição: podes opor-te ao tratamento dos teus dados para fins de marketing ou análise de produto.",
            "Restrição: podes pedir a suspensão temporária do tratamento dos teus dados enquanto uma reclamação é analisada.",
          ],
        },
        {
          title: "14. Como exercer os teus direitos",
          bodyLines: [
            "Para exercer qualquer direito, envia um pedido para suporte@xdigital.co.mz ou contacta-nos via WhatsApp indicando: nome completo, número de telefone ou email associado à conta, e uma descrição clara do pedido.",
            "Podemos solicitar verificação de identidade antes de processar o pedido. Respondemos no prazo máximo de 30 dias. Para pedidos de eliminação de dados, o prazo pode ser estendido até 90 dias quando existam obrigações legais de retenção a avaliar.",
          ],
        },
        {
          title: "15. Prevenção de fraude e monitorização",
          body: "A X Digital monitoriza padrões de comportamento para prevenir fraude, uso indevido da plataforma e tentativas de esquemas com pagamentos. Dados recolhidos para este fim são tratados com base no interesse legítimo da empresa e dos clientes em garantir um ambiente seguro. Não utilizamos estes dados para qualquer outra finalidade.",
        },
        {
          title: "16. Base legal para o tratamento",
          items: [
            "Execução de contrato: tratamento necessário para processar pedidos, pagamentos e entregas.",
            "Consentimento: comunicações de marketing e uso de dados para melhoria de produto (podes retirar o consentimento a qualquer momento).",
            "Interesse legítimo: prevenção de fraude, segurança da plataforma e manutenção de registos de suporte.",
            "Obrigação legal: retenção de dados fiscais e partilha com autoridades competentes quando exigido por lei.",
          ],
        },
        {
          title: "17. Alterações a esta política",
          body: "Podemos actualizar esta política periodicamente. Quando as alterações forem materiais, notificaremos por email ou notificação na plataforma com antecedência mínima de 15 dias. A continuação do uso dos serviços após esse prazo constitui aceitação das alterações.",
        },
        {
          title: "18. Legislação aplicável",
          body: "Esta política é regida pela Lei n.º 1/2021 de Protecção de Dados Pessoais de Moçambique e demais legislação aplicável. Para efeitos de resolução de litígios, são competentes os tribunais da cidade de Maputo, sem prejuízo do direito à reclamação junto da entidade reguladora competente em matéria de protecção de dados.",
        },
        {
          title: "19. Contacto e reclamações",
          bodyLines: [
            "Para questões sobre privacidade ou para exercer os teus direitos: suporte@xdigital.co.mz",
            "Se considerares que o tratamento dos teus dados viola a legislação aplicável, tens o direito de apresentar reclamação junto da autoridade de protecção de dados competente em Moçambique.",
          ],
        },
      ]}
      cta={{ label: "Ver termos de uso", href: "/terms" }}
    />
  );
}
