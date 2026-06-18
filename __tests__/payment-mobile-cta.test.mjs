import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("payment page mobile CTA", () => {
  it("shows the sticky payment CTA only after a payment method is selected", () => {
    const paymentPage = read("app/(client)/orders/[id]/payment/page.tsx");

    assert.match(paymentPage, /selectedPaymentMethod, setSelectedPaymentMethod\] = useState<PaySuiteMethod \| null>\(null\)/);
    assert.match(paymentPage, /selectedPaymentMethod !== null \? \(/);
    assert.match(paymentPage, /setSelectedPaymentMethod\(method\)/);
    assert.match(paymentPage, /Escolhe uma forma de pagamento abaixo/);
    assert.match(paymentPage, /Formas de pagamento disponiveis abaixo/);
    assert.match(paymentPage, /Continuar com \$\{paysuiteMethodLabel\(selectedPaymentMethod\)\}/);
  });
});
