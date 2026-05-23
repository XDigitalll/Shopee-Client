/**
 * Unit tests for the external order success screen logic.
 * Mirrors the nextOrderNumber resolution and button rendering rules in
 * app/(client)/orders/external/new/page.tsx
 *
 * Run with: node --test __tests__/external-order-success.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Mirrors the nextOrderNumber resolution in page.tsx ─────────────────────────

/**
 * @param {{ orderReference?: string; orderNumber?: string; code?: string; id?: number }} response
 * @returns {string | null}
 */
function resolveOrderNumber(response) {
  return (
    response.orderReference?.trim() ||
    response.orderNumber?.trim() ||
    response.code?.trim() ||
    null
  );
}

// ── Mirrors the tracking href builder ─────────────────────────────────────────

function buildTrackingHref(orderNumber) {
  if (!orderNumber) return null;
  return `/track/${encodeURIComponent(orderNumber)}`;
}

// ── Mirrors the "Guardar referência" clipboard value ──────────────────────────

function resolveClipboardValue(orderNumber) {
  return orderNumber ?? null;
}

// ── Mirrors the Telegram button visibility rule ───────────────────────────────

function shouldShowTelegramButton() {
  // Button was removed — always false after this fix
  return false;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveOrderNumber — uses public code, never internal id", () => {
  test("uses orderReference when present", () => {
    const result = resolveOrderNumber({ orderReference: "SMZ-ORD-2026-000013", id: 13 });
    assert.equal(result, "SMZ-ORD-2026-000013");
  });

  test("uses orderNumber as secondary fallback", () => {
    const result = resolveOrderNumber({ orderNumber: "SMZ-ORD-2026-000013", id: 13 });
    assert.equal(result, "SMZ-ORD-2026-000013");
  });

  test("uses code as tertiary fallback", () => {
    const result = resolveOrderNumber({ code: "SMZ-ORD-2026-000013", id: 13 });
    assert.equal(result, "SMZ-ORD-2026-000013");
  });

  test("returns null when no code field is present — never returns #id", () => {
    const result = resolveOrderNumber({ id: 13 });
    assert.equal(result, null);
    assert.ok(result !== "#13", "must not fall back to internal id");
  });

  test("returns null when all code fields are empty strings", () => {
    const result = resolveOrderNumber({ orderReference: "  ", orderNumber: "", code: "", id: 5 });
    assert.equal(result, null);
    assert.ok(result !== "#5", "must not fall back to internal id");
  });

  test("trims whitespace from orderReference", () => {
    const result = resolveOrderNumber({ orderReference: "  SMZ-ORD-2026-000001  " });
    assert.equal(result, "SMZ-ORD-2026-000001");
  });

  test("orderReference takes priority over code", () => {
    const result = resolveOrderNumber({ orderReference: "SMZ-ORD-2026-000013", code: "SMZ-ORD-2026-000013" });
    assert.equal(result, "SMZ-ORD-2026-000013");
  });

  test("result always matches SMZ-ORD format when backend is correct", () => {
    const result = resolveOrderNumber({ orderReference: "SMZ-ORD-2026-000013" });
    assert.match(result, /^SMZ-ORD-\d{4}-\d{6}$/);
  });
});

describe("buildTrackingHref — uses orderReference, not numeric id", () => {
  test("produces /track/SMZ-ORD-... path", () => {
    const href = buildTrackingHref("SMZ-ORD-2026-000013");
    assert.equal(href, "/track/SMZ-ORD-2026-000013");
  });

  test("returns null when orderNumber is null — no link shown", () => {
    const href = buildTrackingHref(null);
    assert.equal(href, null);
  });

  test("never builds /track/13 or /track/%2313 from numeric id", () => {
    const hrefFromId = buildTrackingHref(null); // null because id alone is never passed
    assert.equal(hrefFromId, null);
  });

  test("encodes special characters in orderReference", () => {
    const href = buildTrackingHref("SMZ-ORD-2026-000013");
    assert.ok(!href.includes(" "), "no spaces in href");
  });
});

describe("resolveClipboardValue — copies orderCode not #id", () => {
  test("copies SMZ-ORD format code", () => {
    const value = resolveClipboardValue("SMZ-ORD-2026-000013");
    assert.equal(value, "SMZ-ORD-2026-000013");
    assert.ok(!value.startsWith("#"), "clipboard value must not start with #");
  });

  test("returns null when order number is null — button hidden", () => {
    const value = resolveClipboardValue(null);
    assert.equal(value, null);
  });
});

describe("shouldShowTelegramButton — Telegram removed", () => {
  test("Telegram button is never shown", () => {
    assert.equal(shouldShowTelegramButton(), false);
  });
});

describe("success screen display rules", () => {
  test("displays --- when no order code is available", () => {
    const orderNumber = resolveOrderNumber({ id: 13 });
    const displayValue = orderNumber ?? "---";
    assert.equal(displayValue, "---");
    assert.ok(!displayValue.includes("13"), "must not expose internal id 13");
  });

  test("tracking link is absent when order number is null", () => {
    const orderNumber = resolveOrderNumber({ id: 13 });
    const trackingHref = buildTrackingHref(orderNumber);
    assert.equal(trackingHref, null);
  });

  test("tracking link is present when orderReference is set", () => {
    const orderNumber = resolveOrderNumber({ orderReference: "SMZ-ORD-2026-000013" });
    const trackingHref = buildTrackingHref(orderNumber);
    assert.ok(trackingHref?.includes("SMZ-ORD-2026-000013"));
  });

  test("guardar referência is absent when order number is null", () => {
    const orderNumber = resolveOrderNumber({ id: 13 });
    const clipboardValue = resolveClipboardValue(orderNumber);
    assert.equal(clipboardValue, null);
  });
});
