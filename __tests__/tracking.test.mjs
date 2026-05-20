/**
 * Unit tests for public order tracking page logic.
 * Tests phone normalization, validation, and step derivation inline.
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

// ── Timeline builder (mirrors buildVerticalTimeline logic) ────────────────────

function customerStage(status) {
  const map = {
    CREATED: "RECEIVED", UNDER_REVIEW: "PRICING", QUOTED: "PRICING",
    APPROVED: "AWAITING_PAYMENT", PENDING_PAYMENT: "AWAITING_PAYMENT",
    PAYMENT_SUBMITTED: "AWAITING_PAYMENT", PAYMENT_UNDER_REVIEW: "AWAITING_PAYMENT",
    PAYMENT_REJECTED: "AWAITING_PAYMENT", PAID: "CONFIRMED",
    TO_PURCHASE: "PROCESSING", ORDERED: "PROCESSING", PURCHASED: "PROCESSING",
    IN_TRANSIT: "INTERNATIONAL_TRANSIT", ARRIVED: "AT_HQ",
    READY_FOR_DELIVERY: "AT_HQ", OUT_FOR_DELIVERY: "ON_THE_WAY",
    DELIVERED: "DELIVERED", CANCELLED: "CANCELLED", FAILED: "CANCELLED",
  };
  return map[status] || "RECEIVED";
}

function buildTimelineSteps(status, isExternal = true) {
  const isCancelled = status === "CANCELLED" || status === "FAILED";
  const STAGES_EXT = ["RECEIVED", "PRICING", "AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "INTERNATIONAL_TRANSIT", "AT_HQ", "ON_THE_WAY", "DELIVERED"];
  const STAGES_INT = ["RECEIVED", "AWAITING_PAYMENT", "CONFIRMED", "ON_THE_WAY", "DELIVERED"];
  const stages = isExternal ? STAGES_EXT : STAGES_INT;
  const currentStage = customerStage(status);
  const currentIdx = isCancelled ? -1 : stages.indexOf(currentStage);

  const steps = stages.map((stage, i) => ({
    key: stage,
    done: !isCancelled && i < currentIdx,
    current: !isCancelled && i === currentIdx,
  }));

  if (isCancelled) {
    steps.push({ key: "CANCELLED", done: false, current: true });
  }

  return steps;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

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

describe("timeline steps — external order", () => {
  test("UNDER_REVIEW: PRICING step is current, RECEIVED is done", () => {
    const steps = buildTimelineSteps("UNDER_REVIEW", true);
    const current = steps.filter((s) => s.current);
    assert.equal(current.length, 1);
    assert.equal(current[0].key, "PRICING");
    assert.ok(steps.find((s) => s.key === "RECEIVED")?.done);
  });

  test("QUOTED: RECEIVED done, PRICING current", () => {
    const steps = buildTimelineSteps("QUOTED", true);
    assert.ok(steps.find((s) => s.key === "RECEIVED")?.done);
    assert.ok(steps.find((s) => s.key === "PRICING")?.current);
  });

  test("PAID: first three steps done, CONFIRMED current", () => {
    const steps = buildTimelineSteps("PAID", true);
    assert.ok(steps.find((s) => s.key === "CONFIRMED")?.current);
    assert.ok(steps.find((s) => s.key === "RECEIVED")?.done);
    assert.ok(steps.find((s) => s.key === "PRICING")?.done);
    assert.ok(steps.find((s) => s.key === "AWAITING_PAYMENT")?.done);
  });

  test("DELIVERED: all preceding steps done, DELIVERED step is current", () => {
    const steps = buildTimelineSteps("DELIVERED", true);
    // Every step before DELIVERED is done
    assert.ok(steps.every((s) => s.done || s.key === "DELIVERED"));
    // DELIVERED itself is not done (it's the active step)
    assert.ok(steps.find((s) => s.key === "DELIVERED")?.done === false);
    // DELIVERED is the current step
    assert.ok(steps.find((s) => s.key === "DELIVERED")?.current);
  });

  test("CANCELLED: CANCELLED step is current", () => {
    const steps = buildTimelineSteps("CANCELLED", true);
    const cancelled = steps.find((s) => s.key === "CANCELLED");
    assert.ok(cancelled);
    assert.ok(cancelled.current);
    assert.ok(steps.every((s) => !s.done));
  });
});

describe("timeline steps — internal order", () => {
  test("PENDING_PAYMENT: RECEIVED done, AWAITING_PAYMENT current", () => {
    const steps = buildTimelineSteps("PENDING_PAYMENT", false);
    assert.ok(steps.find((s) => s.key === "RECEIVED")?.done);
    assert.ok(steps.find((s) => s.key === "AWAITING_PAYMENT")?.current);
  });

  test("PAID: CONFIRMED current", () => {
    const steps = buildTimelineSteps("PAID", false);
    assert.ok(steps.find((s) => s.key === "CONFIRMED")?.current);
  });

  test("internal steps do not include PRICING or PROCESSING", () => {
    const steps = buildTimelineSteps("PAID", false);
    assert.ok(!steps.find((s) => s.key === "PRICING"));
    assert.ok(!steps.find((s) => s.key === "PROCESSING"));
  });
});
