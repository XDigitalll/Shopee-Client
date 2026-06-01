import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("WhatsApp floating support button", () => {
  const component = read("../components/support/whatsapp-floating-button.tsx");
  const layout = read("../app/layout.tsx");
  const contacts = read("../lib/support-contacts.ts");

  it("is integrated in the root client layout shell", () => {
    assert.match(layout, /WhatsappFloatingButton/);
  });

  it("renders with accessible WhatsApp support affordances", () => {
    assert.match(component, /aria-label="Falar com suporte no WhatsApp"/);
    assert.match(component, /title="Falar com suporte"/);
    assert.match(component, /target="_blank"/);
    assert.match(component, /rel="noopener noreferrer"/);
    assert.match(component, /WhatsApp/);
  });

  it("uses the official prefilled WhatsApp link", () => {
    assert.match(
      contacts,
      /https:\/\/wa\.me\/258864698775\?text=Ol%C3%A1%20ShopeeMz%2C%20preciso%20de%20ajuda%20com%20o%20meu%20pedido\./,
    );
    assert.match(component, /SUPPORT_WHATSAPP_ORDER_HELP_URL/);
  });

  it("hides on admin and dashboard routes", () => {
    assert.match(component, /"\/admin"/);
    assert.match(component, /"\/admin-login"/);
    assert.match(component, /"\/dashboard"/);
    assert.match(component, /shouldShowWhatsappFloatingButton/);
  });
});
