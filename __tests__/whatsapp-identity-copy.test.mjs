import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("customer pages expose Website + WhatsApp identity copy", () => {
  const externalOrder = read("app/(client)/orders/external/new/page.tsx");
  const checkout = read("app/(client)/checkout/page.tsx");
  const orders = read("app/(client)/orders/page.tsx");
  const tracking = read("app/track/[reference]/page.tsx");

  for (const source of [externalOrder, checkout, orders, tracking]) {
    assert.match(source, /Usa o mesmo n[úu]mero da tua conta para consultar pedidos no WhatsApp/);
  }
  assert.match(externalOrder + checkout, /Tamb[ée]m poder[áa]s acompanhar este pedido pelo WhatsApp/);
  assert.match(orders + tracking, /Em breve: acompanhamento autom[áa]tico pelo WhatsApp/);
});

test("contact and how-it-works explain upcoming WhatsApp integration", () => {
  const contact = read("app/contact/page.tsx");
  const howItWorks = read("app/how-it-works/page.tsx");

  assert.match(contact, /WhatsApp ShopeeMz/);
  assert.match(contact, /\+258 86 469 8775/);
  assert.match(contact, /Em breve poder[áa]s consultar pedidos, receber cota[çc][õo]es e acompanhar entregas diretamente pelo WhatsApp/);
  assert.match(howItWorks, /Website \+ WhatsApp integrados/);
  assert.match(howItWorks, /evita duplicacao de pedidos/);
});
