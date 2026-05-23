/**
 * Unit tests for client-side order tracking logic in orders/page.tsx.
 *
 * The local buildTimelineSteps function was removed — the client now renders
 * order.trackingSteps from the backend via the buildVerticalTimeline adapter.
 *
 * Run with: node --test __tests__/tracking.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Phone normalisation (mirrors track/[reference]/page.tsx) ──────────────────

const PHONE_PATTERN = /^\+258(82|83|84|85|86|87)\d{7}$/;

function normalizePhone(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00258")) return `+${digits.slice(2)}`;
  if (digits.startsWith("258") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  return value.trim();
}

function isValidMzPhone(value) {
  return PHONE_PATTERN.test(normalizePhone(value));
}

// ── Backend phone normaliser (mirrors PublicOrderController.java) ─────────────

function backendNormalizePhone(raw) {
  if (!raw || !raw.trim()) return null;
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("00258")) digits = digits.slice(2);
  if (digits.startsWith("258") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 11) return `+${digits}`;
  return null;
}

function phoneMatches(inputPhone, orderPhone) {
  const a = backendNormalizePhone(inputPhone);
  const b = backendNormalizePhone(orderPhone);
  if (!a || !b) return false;
  return a === b;
}

// ── customerStage (mirrors orders/page.tsx) ────────────────────────────────────

function customerStage(status) {
  const map = {
    CREATED: "RECEIVED",
    PENDING: "RECEIVED",
    UNDER_REVIEW: "PRICING",
    QUOTED: "PRICING",
    APPROVED: "AWAITING_PAYMENT",
    PENDING_PAYMENT: "AWAITING_PAYMENT",
    PAYMENT_SUBMITTED: "AWAITING_PAYMENT",
    PAYMENT_UNDER_REVIEW: "AWAITING_PAYMENT",
    PAYMENT_REJECTED: "AWAITING_PAYMENT",
    PAID: "CONFIRMED",
    CONFIRMED: "CONFIRMED",
    TO_PURCHASE: "PROCESSING",
    PURCHASED: "PROCESSING",
    ORDERED: "PROCESSING",
    PROCESSING: "PROCESSING",
    SHIPPED: "INTERNATIONAL_TRANSIT",
    IN_TRANSIT: "INTERNATIONAL_TRANSIT",
    ARRIVED: "AT_HQ",
    READY_FOR_DELIVERY: "ON_THE_WAY",
    OUT_FOR_DELIVERY: "ON_THE_WAY",
    DELIVERED: "DELIVERED",
    CANCELLED: "CANCELLED",
    FAILED: "CANCELLED",
  };
  return map[status] || "RECEIVED";
}

function effectiveOrderStatus(order) {
  return order.status === "PAYMENT_REJECTED" || order.status === "FAILED" ? "FAILED" : order.status;
}

function visibleOrderActions(order) {
  const actions = [];
  if (order.canConfirmAddress) actions.push("confirm-address");
  if (order.canChangeDeliveryAddress) actions.push("change-address");
  if (order.canConfirmDelivery) actions.push("confirm-delivery");
  if (order.status === "DELIVERED") actions.push("delivered-label");
  return actions;
}

// ── buildVerticalTimeline adapter (mirrors orders/page.tsx) ───────────────────

function buildVerticalTimeline(order) {
  const backendSteps = order.trackingDetailSteps;
  if (backendSteps && backendSteps.length > 0) {
    return backendSteps.map((step) => ({
      key: step.key,
      label: step.label,
      desc: step.description ?? "",
      done: step.state === "COMPLETED",
      current: step.state === "CURRENT",
      failed: step.state === "FAILED",
      ts: step.occurredAt ?? null,
    }));
  }
  return [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(key, label, state, opts = {}) {
  return { key, label, state, description: opts.description ?? null, occurredAt: opts.occurredAt ?? null };
}

function makeOrderWithDetailSteps(steps) {
  return { id: 1, type: "EXTERNAL", status: "TO_PURCHASE", trackingDetailSteps: steps };
}

// ── buildSummarySteps mirror (macro tracker logic) ────────────────────────────

const EXTERNAL_MACRO = [
  { key: "RECEIVED",      label: "Pedido recebido",         statuses: ["CREATED", "UNDER_REVIEW"] },
  { key: "QUOTE_PAYMENT", label: "Cotação e pagamento",      statuses: ["QUOTED", "APPROVED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED", "PAID"] },
  { key: "PROCESSING",    label: "Compra em processamento",  statuses: ["TO_PURCHASE", "PURCHASED", "ORDERED"] },
  { key: "IN_TRANSIT",    label: "Em trânsito",              statuses: ["IN_TRANSIT"] },
  { key: "AT_HQ",         label: "Pronto para entrega",      statuses: ["ARRIVED", "READY_FOR_DELIVERY", "DELIVERY_FAILED"] },
  { key: "ON_THE_WAY",    label: "A caminho",                statuses: ["OUT_FOR_DELIVERY"] },
  { key: "DELIVERED",     label: "Entregue",                 statuses: ["DELIVERED"] },
];

const INTERNAL_MACRO = [
  { key: "RECEIVED",    label: "Pedido recebido", statuses: ["UNDER_REVIEW"] },
  { key: "PAYMENT",     label: "Pagamento",        statuses: ["CREATED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED", "APPROVED"] },
  { key: "PREPARATION", label: "Preparação",       statuses: ["PAID", "READY_FOR_FULFILLMENT", "PICKING", "PREPARING", "ORDERED"] },
  { key: "ON_THE_WAY",  label: "A caminho",         statuses: ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"] },
  { key: "DELIVERED",   label: "Entregue",          statuses: ["DELIVERED"] },
];

function buildSummarySteps(status, isExternal = true) {
  const isCancelled = status === "CANCELLED" || status === "FAILED";
  const isPaymentRejected = status === "PAYMENT_REJECTED";
  const macro = isExternal ? EXTERNAL_MACRO : INTERNAL_MACRO;

  let currentIdx = -1;
  if (!isCancelled) {
    currentIdx = macro.findIndex((ms) => ms.statuses.includes(status));
  }

  if (isCancelled) {
    return [
      ...macro.map((ms) => ({ key: ms.key, label: ms.label, state: "PENDING" })),
      { key: "CANCELLED", label: "Cancelado", state: "FAILED" },
    ];
  }

  return macro.map((ms, i) => {
    let state;
    if (currentIdx === -1 || i > currentIdx) state = "PENDING";
    else if (i === currentIdx) state = isPaymentRejected ? "FAILED" : "CURRENT";
    else state = "COMPLETED";
    return { key: ms.key, label: ms.label, state };
  });
}

// ── Tests: phone normalisation ─────────────────────────────────────────────

describe("phone normalisation — frontend", () => {
  test("international format is accepted as-is", () => {
    assert.equal(normalizePhone("+258841234567"), "+258841234567");
  });

  test("9-digit number gets +258 prefix", () => {
    assert.equal(normalizePhone("841234567"), "+258841234567");
  });

  test("00258 prefix is converted", () => {
    assert.equal(normalizePhone("00258841234567"), "+258841234567");
  });

  test("258 prefix with 12 digits is converted", () => {
    assert.equal(normalizePhone("258841234567"), "+258841234567");
  });
});

describe("phone validation — frontend", () => {
  test("operator 84 is valid", () => {
    assert.ok(isValidMzPhone("+258841234567"));
  });

  test("operator 82 is valid", () => {
    assert.ok(isValidMzPhone("+258821234567"));
  });

  test("operator 87 is valid", () => {
    assert.ok(isValidMzPhone("+258871234567"));
  });

  test("operator 81 is invalid", () => {
    assert.ok(!isValidMzPhone("+258811234567"));
  });

  test("operator 80 is invalid", () => {
    assert.ok(!isValidMzPhone("+258801234567"));
  });

  test("empty string is invalid", () => {
    assert.ok(!isValidMzPhone(""));
  });

  test("9-digit 84 number is valid after normalisation", () => {
    assert.ok(isValidMzPhone("841234567"));
  });
});

describe("phone matching — backend (Java mirror)", () => {
  test("exact match succeeds", () => {
    assert.ok(phoneMatches("+258841234567", "+258841234567"));
  });

  test("9-digit input matches full number on order", () => {
    assert.ok(phoneMatches("841234567", "+258841234567"));
  });

  test("00258 format matches +258 format", () => {
    assert.ok(phoneMatches("00258841234567", "+258841234567"));
  });

  test("different numbers do not match", () => {
    assert.ok(!phoneMatches("+258841234567", "+258841234568"));
  });

  test("null order phone returns false", () => {
    assert.ok(!phoneMatches("+258841234567", null));
  });

  test("empty input returns false", () => {
    assert.ok(!phoneMatches("", "+258841234567"));
  });
});

// ── Tests: customerStage ───────────────────────────────────────────────────

describe("customerStage — status mappings", () => {
  test("TO_PURCHASE maps to PROCESSING", () => {
    assert.equal(customerStage("TO_PURCHASE"), "PROCESSING");
  });

  test("PURCHASED maps to PROCESSING", () => {
    assert.equal(customerStage("PURCHASED"), "PROCESSING");
  });

  test("READY_FOR_DELIVERY maps to ON_THE_WAY", () => {
    assert.equal(customerStage("READY_FOR_DELIVERY"), "ON_THE_WAY");
  });

  test("IN_TRANSIT maps to INTERNATIONAL_TRANSIT", () => {
    assert.equal(customerStage("IN_TRANSIT"), "INTERNATIONAL_TRANSIT");
  });

  test("ARRIVED maps to AT_HQ", () => {
    assert.equal(customerStage("ARRIVED"), "AT_HQ");
  });

  test("PAID maps to CONFIRMED", () => {
    assert.equal(customerStage("PAID"), "CONFIRMED");
  });

  test("UNDER_REVIEW maps to PRICING", () => {
    assert.equal(customerStage("UNDER_REVIEW"), "PRICING");
  });

  test("unknown status falls back to RECEIVED", () => {
    assert.equal(customerStage("SOME_FUTURE_STATUS"), "RECEIVED");
  });
});

describe("delivery actions — backend permission flags", () => {
  test("READY_FOR_DELIVERY does not show confirm delivery", () => {
    const actions = visibleOrderActions({
      status: "READY_FOR_DELIVERY",
      canConfirmAddress: true,
      canChangeDeliveryAddress: true,
      canConfirmDelivery: false,
    });

    assert.ok(!actions.includes("confirm-delivery"));
    assert.ok(actions.includes("confirm-address"));
    assert.ok(actions.includes("change-address"));
  });

  test("OUT_FOR_DELIVERY shows confirm delivery only when backend allows it", () => {
    assert.ok(visibleOrderActions({ status: "OUT_FOR_DELIVERY", canConfirmDelivery: true }).includes("confirm-delivery"));
    assert.ok(!visibleOrderActions({ status: "OUT_FOR_DELIVERY", canConfirmDelivery: false }).includes("confirm-delivery"));
  });

  test("DELIVERED shows delivered label without confirm delivery", () => {
    const actions = visibleOrderActions({ status: "DELIVERED", canConfirmDelivery: false });
    assert.ok(actions.includes("delivered-label"));
    assert.ok(!actions.includes("confirm-delivery"));
  });

  test("old failed payment does not override delivered order status", () => {
    assert.equal(effectiveOrderStatus({ status: "DELIVERED", payment: { status: "FAILED" } }), "DELIVERED");
  });

  test("payment rejected message appears only for current rejected order", () => {
    assert.equal(effectiveOrderStatus({ status: "PAYMENT_REJECTED", payment: { status: "FAILED" } }), "FAILED");
  });
});

// ── Tests: buildVerticalTimeline adapter ──────────────────────────────────

describe("buildVerticalTimeline — backend step adapter", () => {
  test("COMPLETED step → done=true, current=false, failed=false", () => {
    const order = makeOrderWithDetailSteps([makeStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED")]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].done, true);
    assert.equal(steps[0].current, false);
    assert.equal(steps[0].failed, false);
  });

  test("CURRENT step → done=false, current=true, failed=false", () => {
    const order = makeOrderWithDetailSteps([makeStep("TO_PURCHASE", "Compra em processamento", "CURRENT")]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].current, true);
    assert.equal(steps[0].done, false);
    assert.equal(steps[0].failed, false);
  });

  test("FAILED step → done=false, current=false, failed=true", () => {
    const order = makeOrderWithDetailSteps([makeStep("PAYMENT_REJECTED", "Pagamento recusado", "FAILED")]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].failed, true);
    assert.equal(steps[0].done, false);
    assert.equal(steps[0].current, false);
  });

  test("PENDING step → done=false, current=false, failed=false", () => {
    const order = makeOrderWithDetailSteps([makeStep("DELIVERED", "Entregue", "PENDING")]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].done, false);
    assert.equal(steps[0].current, false);
    assert.equal(steps[0].failed, false);
  });

  test("null trackingDetailSteps returns empty array", () => {
    const order = { id: 1, trackingDetailSteps: null };
    const steps = buildVerticalTimeline(order);
    assert.deepEqual(steps, []);
  });

  test("empty trackingDetailSteps returns empty array", () => {
    const order = { id: 1, trackingDetailSteps: [] };
    const steps = buildVerticalTimeline(order);
    assert.deepEqual(steps, []);
  });

  test("description is mapped to desc field", () => {
    const order = makeOrderWithDetailSteps([makeStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED", { description: "O pedido foi recebido com sucesso." })]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].desc, "O pedido foi recebido com sucesso.");
  });

  test("null description becomes empty string in desc", () => {
    const order = makeOrderWithDetailSteps([makeStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED")]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].desc, "");
  });

  test("occurredAt is passed through as ts", () => {
    const ts = "2026-05-20T10:00:00";
    const order = makeOrderWithDetailSteps([makeStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED", { occurredAt: ts })]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].ts, ts);
  });

  test("null occurredAt becomes null ts", () => {
    const order = makeOrderWithDetailSteps([makeStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED")]);
    const steps = buildVerticalTimeline(order);
    assert.equal(steps[0].ts, null);
  });

  test("all 14 external steps are mapped correctly", () => {
    const backendSteps = [
      makeStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED"),
      makeStep("QUOTE_ANALYSIS", "Em analise", "COMPLETED"),
      makeStep("QUOTE_READY", "Proposta enviada", "COMPLETED"),
      makeStep("PAYMENT_PENDING", "Aguardando pagamento", "COMPLETED"),
      makeStep("PAYMENT_SUBMITTED", "Comprovativo enviado", "COMPLETED"),
      makeStep("PAYMENT_UNDER_REVIEW", "Pagamento em analise", "COMPLETED"),
      makeStep("PAYMENT_APPROVED", "Pagamento aprovado", "COMPLETED"),
      makeStep("TO_PURCHASE", "Compra em processamento", "CURRENT"),
      makeStep("PURCHASED", "Comprado", "PENDING"),
      makeStep("IN_TRANSIT", "Em transito internacional", "PENDING"),
      makeStep("ARRIVED", "Chegou a sede", "PENDING"),
      makeStep("READY_FOR_DELIVERY", "Pronto para entrega", "PENDING"),
      makeStep("OUT_FOR_DELIVERY", "Saiu para entrega", "PENDING"),
      makeStep("DELIVERED", "Entregue", "PENDING"),
    ];
    const order = makeOrderWithDetailSteps(backendSteps);
    const steps = buildVerticalTimeline(order);

    assert.equal(steps.length, 14);

    const currentSteps = steps.filter((s) => s.current);
    assert.equal(currentSteps.length, 1, "Exactly one CURRENT step");
    assert.equal(currentSteps[0].key, "TO_PURCHASE");

    const doneSteps = steps.filter((s) => s.done);
    assert.equal(doneSteps.length, 7, "7 COMPLETED steps before TO_PURCHASE");

    assert.ok(!steps.find((s) => s.key === "PAYMENT_REJECTED"), "No PAYMENT_REJECTED step when payment is approved");

    const toPurchaseStep = steps.find((s) => s.key === "TO_PURCHASE");
    assert.equal(toPurchaseStep.label, "Compra em processamento");
  });
});

// ── Tests: buildSummarySteps — macro tracker ───────────────────────────────

describe("buildSummarySteps — external order macro tracker", () => {
  test("TO_PURCHASE shows 'Compra em processamento' as CURRENT", () => {
    const steps = buildSummarySteps("TO_PURCHASE", true);
    const current = steps.find((s) => s.state === "CURRENT");
    assert.ok(current, "Must have a CURRENT step");
    assert.equal(current.key, "PROCESSING");
    assert.equal(current.label, "Compra em processamento");
  });

  test("IN_TRANSIT shows 'Em trânsito' as CURRENT", () => {
    const steps = buildSummarySteps("IN_TRANSIT", true);
    const current = steps.find((s) => s.state === "CURRENT");
    assert.ok(current);
    assert.equal(current.key, "IN_TRANSIT");
    assert.equal(current.label, "Em trânsito");
  });

  test("external TO_PURCHASE: exactly 7 macro steps", () => {
    const steps = buildSummarySteps("TO_PURCHASE", true);
    assert.equal(steps.length, 7);
  });

  test("external TO_PURCHASE: RECEIVED and QUOTE_PAYMENT are COMPLETED", () => {
    const steps = buildSummarySteps("TO_PURCHASE", true);
    assert.equal(steps.find((s) => s.key === "RECEIVED").state, "COMPLETED");
    assert.equal(steps.find((s) => s.key === "QUOTE_PAYMENT").state, "COMPLETED");
  });

  test("external TO_PURCHASE: IN_TRANSIT, AT_HQ, ON_THE_WAY, DELIVERED are PENDING", () => {
    const steps = buildSummarySteps("TO_PURCHASE", true);
    ["IN_TRANSIT", "AT_HQ", "ON_THE_WAY", "DELIVERED"].forEach((key) => {
      assert.equal(steps.find((s) => s.key === key).state, "PENDING", `${key} should be PENDING`);
    });
  });

  test("external PAYMENT_REJECTED: QUOTE_PAYMENT step shows FAILED", () => {
    const steps = buildSummarySteps("PAYMENT_REJECTED", true);
    const quotePay = steps.find((s) => s.key === "QUOTE_PAYMENT");
    assert.equal(quotePay.state, "FAILED");
  });

  test("external DELIVERED: all steps COMPLETED except DELIVERED which is CURRENT", () => {
    const steps = buildSummarySteps("DELIVERED", true);
    const delivered = steps.find((s) => s.key === "DELIVERED");
    assert.equal(delivered.state, "CURRENT");
    steps.filter((s) => s.key !== "DELIVERED").forEach((s) => {
      assert.equal(s.state, "COMPLETED", `${s.key} should be COMPLETED`);
    });
  });

  test("external CANCELLED: all PENDING + CANCELLED step with FAILED", () => {
    const steps = buildSummarySteps("CANCELLED", true);
    const cancelled = steps.find((s) => s.key === "CANCELLED");
    assert.ok(cancelled, "CANCELLED step must exist");
    assert.equal(cancelled.state, "FAILED");
    steps.filter((s) => s.key !== "CANCELLED").forEach((s) => {
      assert.equal(s.state, "PENDING", `${s.key} should be PENDING`);
    });
  });

  test("external UNDER_REVIEW: RECEIVED is CURRENT", () => {
    const steps = buildSummarySteps("UNDER_REVIEW", true);
    assert.equal(steps.find((s) => s.key === "RECEIVED").state, "CURRENT");
  });

  test("external QUOTED: QUOTE_PAYMENT is CURRENT, RECEIVED is COMPLETED", () => {
    const steps = buildSummarySteps("QUOTED", true);
    assert.equal(steps.find((s) => s.key === "RECEIVED").state, "COMPLETED");
    assert.equal(steps.find((s) => s.key === "QUOTE_PAYMENT").state, "CURRENT");
  });

  test("mobile: external tracker has at most 7 steps (≤ 7 for scrollable)", () => {
    const steps = buildSummarySteps("TO_PURCHASE", true);
    assert.ok(steps.length <= 7, `Expected ≤ 7, got ${steps.length}`);
  });
});

describe("buildSummarySteps — internal order macro tracker", () => {
  test("READY_FOR_FULFILLMENT shows 'Preparação' as CURRENT", () => {
    const steps = buildSummarySteps("READY_FOR_FULFILLMENT", false);
    const current = steps.find((s) => s.state === "CURRENT");
    assert.ok(current);
    assert.equal(current.key, "PREPARATION");
    assert.equal(current.label, "Preparação");
  });

  test("internal order has exactly 5 macro steps", () => {
    const steps = buildSummarySteps("PENDING_PAYMENT", false);
    assert.equal(steps.length, 5);
  });

  test("PAID maps to PREPARATION (not PAYMENT)", () => {
    const steps = buildSummarySteps("PAID", false);
    assert.equal(steps.find((s) => s.key === "PREPARATION").state, "CURRENT");
    assert.equal(steps.find((s) => s.key === "PAYMENT").state, "COMPLETED");
  });

  test("PENDING_PAYMENT: PAYMENT is CURRENT", () => {
    const steps = buildSummarySteps("PENDING_PAYMENT", false);
    assert.equal(steps.find((s) => s.key === "PAYMENT").state, "CURRENT");
  });

  test("DELIVERED internal: DELIVERED is CURRENT", () => {
    const steps = buildSummarySteps("DELIVERED", false);
    assert.equal(steps.find((s) => s.key === "DELIVERED").state, "CURRENT");
  });

  test("mobile: internal tracker has at most 5 steps", () => {
    const steps = buildSummarySteps("PENDING_PAYMENT", false);
    assert.ok(steps.length <= 5, `Expected ≤ 5, got ${steps.length}`);
  });
});
