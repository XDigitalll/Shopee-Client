import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("delivery payment amount", () => {
  it("uses pending product plus delivery fee for COD delivery payment", () => {
    const page = read("app/(client)/orders/[id]/payment/page.tsx");

    assert.match(page, /function deliveryCollectionBreakdown\(order: Order \| null\)/);
    assert.match(page, /Math\.max\(0, Number\(order\?\.remainingAmountOnDelivery \?\? 0\)\)/);
    assert.match(page, /Math\.max\(0, Number\(order\?\.deliveryFee \?\? 0\)\)/);
    assert.match(page, /total: productPending \+ deliveryFee/);
    assert.match(page, /const officialAmount = deliveryCollectionActive \? deliveryBreakdown\.total : orderVisibleTotal\(order\)/);
    assert.match(page, /Produto pendente/);
    assert.match(page, /Taxa de entrega/);
    assert.match(page, /Total a pagar/);
    assert.match(page, /Nao existe valor pendente para cobrar neste pedido\./);
    assert.doesNotMatch(page, /Valor pendente nao definido|Valor pendente não definido/);
  });
});
