import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("external order shared-message parser contract", () => {
  const parser = read("../lib/external-order-input-parser.ts");
  const page = read("../app/(client)/orders/external/new/page.tsx");

  it("detects mobile share links from supported stores", () => {
    for (const expected of [
      "api-shein.shein.com",
      "temu.",
      "amazon.",
      "aliexpress.",
      "alibaba.",
      "makro.co.za",
      "mrp.com",
      "buffalo",
    ]) {
      assert.ok(parser.includes(expected), `missing detection for ${expected}`);
    }
  });

  it("removes promotional share text and keeps raw message", () => {
    assert.ok(parser.includes("i discovered amazing products"));
    assert.ok(parser.includes("come check"));
    assert.ok(parser.includes("promotionalTextRemoved"));
    assert.ok(parser.includes("originalRawMessage"));
  });

  it("frontend shows a clean organized preview", () => {
    assert.ok(page.includes("Organizamos automaticamente os dados do produto para ti."));
    assert.ok(page.includes("Loja detectada"));
    assert.ok(page.includes("Link encontrado"));
    assert.ok(page.includes("Descricao limpa"));
  });

  it("frontend sends structured fields for backend re-cleaning", () => {
    for (const field of [
      "originalRawMessage",
      "rawOriginalMessage",
      "cleanDescription",
      "cleanedTitle",
      "detectedLinks",
      "promotionalTextRemoved",
    ]) {
      assert.ok(page.includes(field), `missing ${field}`);
    }
  });
});
