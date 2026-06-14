import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("PaySuite retry UX contract", () => {
  const paymentPage = read("../app/(client)/orders/[id]/payment/page.tsx");
  const contacts = read("../lib/support-contacts.ts");
  const footer = read("../components/site-footer.tsx");
  const contactPage = read("../app/contact/page.tsx");
  const howItWorks = read("../app/how-it-works/page.tsx");

  it("shows retry only after safe no-financial-evidence sync states", () => {
    assert.match(paymentPage, /syncStatus === "NO_FINANCIAL_EVIDENCE"/);
    assert.match(paymentPage, /syncStatus === "SYNC_NO_RESPONSE"/);
    assert.match(paymentPage, /paysuitePayment\.financialEvidence !== true/);
    assert.match(paymentPage, /paysuitePayment\?\.canRetry/);
    assert.match(paymentPage, /orderStatus === "PENDING_PAYMENT"/);
    assert.match(paymentPage, /Gerar nova tentativa de pagamento/);
  });

  it("calls the safe backend retry endpoint", () => {
    assert.match(paymentPage, /orders\/\$\{order\.id\}\/payment\/paysuite\/retry/);
    assert.match(paymentPage, /method: "POST"/);
  });

  it("uses the official WhatsApp support link", () => {
    assert.match(contacts, /https:\/\/wa\.me\/258864698775/);
    assert.match(paymentPage, /SUPPORT_WHATSAPP_URL/);
  });

  it("warns customers not to pay again when money left the account", () => {
    assert.match(contacts, /nao repitas o pagamento/);
    assert.match(paymentPage, /PAYMENT_SUPPORT_MESSAGE/);
  });

  it("publishes official contacts in footer, contact page, and help page", () => {
    for (const source of [footer, contactPage, howItWorks]) {
      assert.match(source, /SUPPORT_WHATSAPP_LABEL/);
      assert.match(source, /SUPPORT_EMAIL/);
    }
  });

  it("shows warning modal before allowing retry — no direct retry button", () => {
    assert.match(paymentPage, /Atenção antes de gerar novo pagamento/);
    assert.match(paymentPage, /NÃO cries outro pagamento/);
    assert.match(paymentPage, /Voltar e verificar atualização/);
    assert.match(paymentPage, /Tenho certeza, quero escolher outro método/);
    // The warning modal is the only path to the retry method selector.
    assert.match(paymentPage, /retry_warning/);
    assert.match(paymentPage, /retry_choose_method/);
  });

  it("method change is secondary action — primary is verify", () => {
    assert.match(paymentPage, /Alterar método de pagamento \/ tentar novamente/);
    assert.match(paymentPage, /Verificar atualização/);
  });

  it("method selector is gated by state machine — only visible in ready_to_pay or retry_choose_method", () => {
    // Method selector is controlled by the state machine, not derived multi-flags.
    assert.match(paymentPage, /methodSelectorVisible/);
    assert.match(paymentPage, /isRetryContext/);
    // ready_to_pay and retry_choose_method are the only states where the selector appears.
    assert.match(paymentPage, /uiState === "ready_to_pay".*verificationOk.*uiState === "retry_choose_method"/);
  });

  it("loading overlay shows safe message when returning from gateway", () => {
    assert.match(paymentPage, /Estamos a confirmar o teu pagamento/);
    assert.match(paymentPage, /Isto pode levar alguns segundos/);
    assert.match(paymentPage, /uiState === "confirming"/);
  });

  it("retry pay button routes to retry endpoint when canGenerateRetry, new payment otherwise", () => {
    // The pay button inside the method selector calls the correct handler based on retry context.
    assert.match(paymentPage, /isRetryContext && canGenerateRetry \? handlePaySuiteRetry/);
  });
});
