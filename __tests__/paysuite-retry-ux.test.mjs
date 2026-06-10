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
    assert.match(paymentPage, /Voltar e verificar pagamento/);
    assert.match(paymentPage, /Tenho certeza, quero escolher outro método/);
    // The old direct retry button must not exist — retry is only reachable via the modal
    assert.doesNotMatch(paymentPage, /handlePaySuiteRetry\(\)\s*\}\s*\}\s*>\s*\{isPaySuiteBusy/);
  });

  it("method change is secondary action — primary is verify", () => {
    assert.match(paymentPage, /Alterar método de pagamento \/ tentar novamente/);
    assert.match(paymentPage, /Verificar pagamento/);
  });

  it("method selector is gated by showRetryMethodSelector state after modal confirmation", () => {
    assert.match(paymentPage, /showRetryMethodSelector/);
    assert.match(paymentPage, /isRetryMethodSelector/);
    assert.match(paymentPage, /methodSelectorVisible/);
  });

  it("loading overlay shows safe message when returning from gateway", () => {
    assert.match(paymentPage, /Estamos a verificar se o pagamento foi concluído/);
    assert.match(paymentPage, /Não pagues novamente/);
    assert.match(paymentPage, /returningFromPaySuite && isInitialSyncLoading/);
  });

  it("retry pay button routes to retry endpoint when canGenerateRetry, new payment otherwise", () => {
    // The pay button inside the method selector calls the correct handler based on retry context
    assert.match(paymentPage, /isRetryMethodSelector && canGenerateRetry \? handlePaySuiteRetry/);
  });
});
