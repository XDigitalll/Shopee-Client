import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("internal COD delivery payment gate", () => {
  it("does not let OUT_FOR_DELIVERY COD show confirm delivery or payment CTA in orders list", () => {
    const ordersPage = read("app/(client)/orders/page.tsx");

    assert.match(
      ordersPage,
      /const canConfirmDelivery = !isInternalCod && \(Boolean\(order\.canConfirmDelivery\) \|\| status === "OUT_FOR_DELIVERY"\)/,
    );
    assert.match(ordersPage, /O estafeta irá solicitar o pagamento quando chegar ao local\./);
    assert.doesNotMatch(
      ordersPage,
      /status === "OUT_FOR_DELIVERY"[\s\S]{0,220}href=\{`\/orders\/\$\{order\.id\}\/payment`\}/,
    );
  });

  it("shows one Pagar agora CTA only after AWAITING_DELIVERY_PAYMENT", () => {
    const ordersPage = read("app/(client)/orders/page.tsx");
    const awaitingBlock = ordersPage.slice(
      ordersPage.indexOf('status === "AWAITING_DELIVERY_PAYMENT"'),
      ordersPage.indexOf("{order.adminMessageForClient"),
    );

    assert.match(awaitingBlock, /O teu pedido chegou\. Finaliza o pagamento para receber\./);
    assert.match(awaitingBlock, /Pagar agora/);
    assert.doesNotMatch(awaitingBlock, /Enviar comprovativo|Informar dinheiro/);
  });

  it("payment page blocks internal COD before delivery payment is requested", () => {
    const paymentPage = read("app/(client)/orders/[id]/payment/page.tsx");

    assert.match(paymentPage, /cod_not_requested/);
    assert.match(paymentPage, /function isCodDeliveryPaymentNotRequested/);
    assert.match(paymentPage, /Pagamento ainda não solicitado/);
    assert.match(paymentPage, /O estafeta irá liberar o pagamento quando chegar ao local\./);
    assert.match(paymentPage, /isCodDeliveryPaymentAwaiting\(currentOrder\)\) return "ready_to_pay"/);
  });
});
