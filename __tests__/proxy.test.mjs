/**
 * Unit tests for proxy.ts route protection logic.
 * Tests the isProtected() function logic inline (without importing TS directly).
 * Run with: node --test __tests__/proxy.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Inline implementation mirrors proxy.ts ────────────────────────────────────

const PROTECTED_PREFIXES = [
  "/profile",
  "/orders",
  "/checkout",
  "/notifications",
  "/delivery-address",
  "/settings",
];

const PUBLIC_EXCEPTIONS = ["/orders/external/new"];

function isProtected(pathname) {
  for (const exc of PUBLIC_EXCEPTIONS) {
    if (pathname === exc || pathname.startsWith(`${exc}/`)) return false;
  }
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isProtected — public routes pass through", () => {
  test("/", () => assert.equal(isProtected("/"), false));
  test("/login", () => assert.equal(isProtected("/login"), false));
  test("/store", () => assert.equal(isProtected("/store"), false));
  test("/store/123", () => assert.equal(isProtected("/store/123"), false));
  test("/forgot-password", () => assert.equal(isProtected("/forgot-password"), false));
  test("/reset-password", () => assert.equal(isProtected("/reset-password"), false));
  test("/privacy", () => assert.equal(isProtected("/privacy"), false));
  test("/terms", () => assert.equal(isProtected("/terms"), false));
  test("/complete-account/profile", () => assert.equal(isProtected("/complete-account/profile"), false));
  test("/complete-account/password", () => assert.equal(isProtected("/complete-account/password"), false));
});

describe("isProtected — protected routes require session", () => {
  test("/profile", () => assert.equal(isProtected("/profile"), true));
  test("/profile/change-password", () => assert.equal(isProtected("/profile/change-password"), true));
  test("/orders", () => assert.equal(isProtected("/orders"), true));
  test("/orders/42", () => assert.equal(isProtected("/orders/42"), true));
  test("/orders/42/payment", () => assert.equal(isProtected("/orders/42/payment"), true));
  test("/checkout", () => assert.equal(isProtected("/checkout"), true));
  test("/notifications", () => assert.equal(isProtected("/notifications"), true));
  test("/delivery-address/PROMO123", () => assert.equal(isProtected("/delivery-address/PROMO123"), true));
  test("/settings", () => assert.equal(isProtected("/settings"), true));
});

describe("isProtected — public exceptions within protected prefix", () => {
  test("/orders/external/new is public", () => assert.equal(isProtected("/orders/external/new"), false));
  test("/orders/external/new/ is public", () => assert.equal(isProtected("/orders/external/new/"), false));
  test("/orders/external (not an exception)", () => assert.equal(isProtected("/orders/external"), true));
});

describe("isProtected — public tracking routes", () => {
  test("/track is public (no login required)", () => assert.equal(isProtected("/track"), false));
  test("/track/SMZ-ORD-2026-000041 is public", () => assert.equal(isProtected("/track/SMZ-ORD-2026-000041"), false));
  test("/track/REF/anything is public", () => assert.equal(isProtected("/track/REF/anything"), false));
});
