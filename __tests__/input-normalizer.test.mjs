/**
 * Unit tests for utils/input-normalizer.ts
 * Run with: node --test __tests__/input-normalizer.test.mjs
 *
 * Uses Node.js built-in test runner (Node ≥ 18) — no extra dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Inline implementations (mirrors the TS source without imports) ────────────
// We duplicate the logic here so tests can run without a build step.

const ZERO_WIDTH_PATTERN = /[​-‍﻿­͏؜឴឵᠎ -‏ﾠ￰-￿]/g;
const HTML_TAG_PATTERN = /<[^>]*>/gi;
const DANGEROUS_ATTR_PATTERN = /\bon\w+\s*=|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/gi;
const SQL_INJECTION_PATTERN = /('|")\s*(OR|AND|UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|CAST|CONVERT)\s/gi;
const SPAM_REPEAT_PATTERN = /(.)\1{7,}/g;

function normalizeWhitespace(raw) {
  return raw.replace(ZERO_WIDTH_PATTERN, "").replace(/\r\n|\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

const DANGEROUS_TAG_PATTERN = /<(script|iframe|object|embed|form|svg|math|link|meta|base)\b/gi;

function sanitizeTextField(raw) {
  if (!raw) return { value: "", blocked: false };
  const value = normalizeWhitespace(raw);
  // 1. Dangerous tags — check before stripping
  DANGEROUS_TAG_PATTERN.lastIndex = 0;
  if (DANGEROUS_TAG_PATTERN.test(value)) return { value: "", blocked: true, reason: "xss" };
  // 2. Event-handler attributes and dangerous protocols
  DANGEROUS_ATTR_PATTERN.lastIndex = 0;
  if (DANGEROUS_ATTR_PATTERN.test(value)) return { value: "", blocked: true, reason: "xss" };
  DANGEROUS_ATTR_PATTERN.lastIndex = 0;
  // 3. SQL injection
  SQL_INJECTION_PATTERN.lastIndex = 0;
  if (SQL_INJECTION_PATTERN.test(value)) return { value: "", blocked: true, reason: "sql" };
  SQL_INJECTION_PATTERN.lastIndex = 0;
  // 4. Keyboard spam
  SPAM_REPEAT_PATTERN.lastIndex = 0;
  if (SPAM_REPEAT_PATTERN.test(value)) return { value: "", blocked: true, reason: "spam" };
  SPAM_REPEAT_PATTERN.lastIndex = 0;
  // 5. Strip remaining benign HTML tags
  const clean = value.replace(HTML_TAG_PATTERN, "").trim();
  return { value: clean, blocked: false };
}

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00258")) return `+${digits.slice(2)}`;
  if (digits.startsWith("258")) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return raw.trim();
}

function normalizeEmail(raw) {
  return raw.trim().toLowerCase();
}

function sanitizeUrl(raw) {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return trimmed;
    return null;
  } catch {
    return null;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("normalizeWhitespace", () => {
  test("trims leading and trailing spaces", () => {
    assert.equal(normalizeWhitespace("  Joao  "), "Joao");
  });

  test("collapses multiple spaces into one", () => {
    assert.equal(normalizeWhitespace("Joao     Pedro"), "Joao Pedro");
  });

  test("removes zero-width characters", () => {
    assert.equal(normalizeWhitespace("Jo​ao"), "Joao");
  });

  test("collapses tabs", () => {
    assert.equal(normalizeWhitespace("Joao\t\tPedro"), "Joao Pedro");
  });
});

describe("sanitizeTextField", () => {
  test("passes normal text through unchanged", () => {
    const result = sanitizeTextField("Sidonio Manhica");
    assert.equal(result.blocked, false);
    assert.equal(result.value, "Sidonio Manhica");
  });

  test("strips HTML tags", () => {
    const result = sanitizeTextField("Hello <b>world</b>");
    assert.equal(result.value, "Hello world");
    assert.equal(result.blocked, false);
  });

  test("blocks <script> injection", () => {
    const result = sanitizeTextField('<script>alert(1)</script>');
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "xss");
  });

  test("blocks onerror= attribute", () => {
    const result = sanitizeTextField('<img src=x onerror=alert(1)>');
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "xss");
  });

  test("blocks javascript: protocol", () => {
    const result = sanitizeTextField("javascript:alert(1)");
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "xss");
  });

  test("blocks SQL injection pattern", () => {
    const result = sanitizeTextField("' OR 1=1 --");
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "sql");
  });

  test("allows legitimate apostrophe in names", () => {
    // "O'Brien" should NOT be blocked — no SQL keyword follows the apostrophe
    const result = sanitizeTextField("O'Brien");
    assert.equal(result.blocked, false);
  });

  test("blocks keyboard spam (8+ identical chars)", () => {
    const result = sanitizeTextField("AAAAAAAAA");
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "spam");
  });

  test("does not block 7 identical chars (boundary)", () => {
    const result = sanitizeTextField("AAAAAAA");
    assert.equal(result.blocked, false);
  });

  test("handles empty string", () => {
    assert.equal(sanitizeTextField("").blocked, false);
    assert.equal(sanitizeTextField("").value, "");
  });
});

describe("normalizePhone", () => {
  test("9-digit number gets +258 prefix", () => {
    assert.equal(normalizePhone("841234567"), "+258841234567");
  });

  test("00258 prefix is converted to +258", () => {
    assert.equal(normalizePhone("00258841234567"), "+258841234567");
  });

  test("258 prefix is converted to +258", () => {
    assert.equal(normalizePhone("258841234567"), "+258841234567");
  });

  test("already-correct +258 number is returned as-is", () => {
    assert.equal(normalizePhone("+258841234567"), "+258841234567");
  });

  test("strips spaces and dashes", () => {
    assert.equal(normalizePhone("+258 84 123 4567"), "+258841234567");
  });
});

describe("normalizeEmail", () => {
  test("lowercases the email", () => {
    assert.equal(normalizeEmail("JOAO@EXAMPLE.COM"), "joao@example.com");
  });

  test("trims whitespace", () => {
    assert.equal(normalizeEmail("  user@test.com  "), "user@test.com");
  });
});

describe("sanitizeUrl", () => {
  test("accepts https URL", () => {
    assert.equal(sanitizeUrl("https://maps.google.com/xyz"), "https://maps.google.com/xyz");
  });

  test("accepts http URL", () => {
    assert.equal(sanitizeUrl("http://example.com"), "http://example.com");
  });

  test("rejects javascript: protocol", () => {
    assert.equal(sanitizeUrl("javascript:alert(1)"), null);
  });

  test("rejects data: protocol", () => {
    assert.equal(sanitizeUrl("data:text/html,<h1>hi</h1>"), null);
  });

  test("rejects plain text", () => {
    assert.equal(sanitizeUrl("not-a-url"), null);
  });

  test("trims whitespace before checking", () => {
    assert.equal(sanitizeUrl("  https://example.com  "), "https://example.com");
  });
});
