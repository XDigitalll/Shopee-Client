import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function deliveryPaymentBreakdown(order) {
  const productPending = Math.max(0, Number(order.remainingAmountOnDelivery ?? 0));
  const deliveryPending = Math.max(0, Number(order.deliveryFee ?? 0));
  return {
    productPending,
    deliveryPending,
    totalToPayNow: productPending + deliveryPending,
  };
}

describe("client delivery payment card", () => {
  it("calculates total as product pending plus delivery pending", () => {
    assert.equal(deliveryPaymentBreakdown({ remainingAmountOnDelivery: 0, deliveryFee: 130 }).totalToPayNow, 130);
    assert.equal(deliveryPaymentBreakdown({ remainingAmountOnDelivery: 1000, deliveryFee: 130 }).totalToPayNow, 1130);
    assert.equal(deliveryPaymentBreakdown({ remainingAmountOnDelivery: null, deliveryFee: 130 }).totalToPayNow, 130);
    assert.equal(deliveryPaymentBreakdown({ remainingAmountOnDelivery: 0, deliveryFee: 0 }).totalToPayNow, 0);
  });

  it("renders the client card from the safe breakdown and blocks duplicate payment after success", () => {
    const page = read("app/(client)/orders/page.tsx");

    assert.match(page, /function deliveryPaymentBreakdown\(order: Order\)/);
    assert.match(page, /Math\.max\(0, Number\(order\.remainingAmountOnDelivery \?\? 0\)\)/);
    assert.match(page, /Math\.max\(0, Number\(order\.deliveryFee \?\? 0\)\)/);
    assert.match(page, /totalToPayNow: productPending \+ deliveryPending/);
    assert.match(page, /const canCollectDeliveryPayment = deliveryPayment\.totalToPayNow > 0 && !deliveryPaymentReceived/);
    assert.match(page, /Pagamento recebido/);
    assert.match(page, /DELIVERY_PAYMENT_RECEIVED/);
    assert.match(page, /Produto pendente/);
    assert.match(page, /Taxa de entrega/);
    assert.match(page, /Total a pagar agora/);
    assert.match(page, /Escolher forma de pagamento/);
    assert.doesNotMatch(page, /Math\.max\(0, order\.remainingAmountOnDelivery - order\.deliveryFee\)/);
  });
});
