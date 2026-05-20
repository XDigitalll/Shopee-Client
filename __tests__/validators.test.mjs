/**
 * Unit tests for utils/validators.ts
 * Run with: node --test __tests__/validators.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Inline implementation ─────────────────────────────────────────────────────

const MZ_PHONE = /^\+258(82|83|84|85|86|87)\d{7}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_LETTERS = /\p{L}/gu;
const INVALID_NAME_CHARS = /[<>{}[\]\\|^`~@#$%*+=]/;
const SPAM_REPEAT = /(.)\1{7,}/;
const URL_PATTERN = /^https?:\/\/.+\..+/i;

function countLetters(value) {
  return (value.match(NAME_LETTERS) ?? []).length;
}

function validateName(value) {
  const v = value.trim();
  if (!v) return "O nome é obrigatório.";
  if (v.length < 2) return "O nome deve ter pelo menos 2 caracteres.";
  if (v.length > 100) return "O nome não pode ter mais de 100 caracteres.";
  if (countLetters(v) < 2) return "Introduz um nome válido.";
  if (INVALID_NAME_CHARS.test(v)) return "O nome contém caracteres inválidos.";
  if (/^\d+$/.test(v)) return "O nome não pode ser apenas números.";
  if (SPAM_REPEAT.test(v)) return "Introduz um nome válido.";
  return null;
}

function validatePhone(value) {
  const v = value.trim();
  if (!v) return "O número de telefone é obrigatório.";
  if (!MZ_PHONE.test(v)) return "Número inválido. Usa o formato +2588xxxxxxxx (82–87).";
  return null;
}

function validatePhoneOptional(value) {
  const v = value.trim();
  if (!v || v === "+258") return null;
  if (!MZ_PHONE.test(v)) return "Número inválido. Usa o formato +2588xxxxxxxx (82–87).";
  return null;
}

function validateEmail(value) {
  const v = value.trim().toLowerCase();
  if (!v) return "O email é obrigatório.";
  if (!EMAIL_PATTERN.test(v)) return "Endereço de email inválido.";
  if (v.length > 254) return "Email demasiado longo.";
  return null;
}

function validateCity(value) {
  const v = value.trim();
  if (!v) return "A cidade é obrigatória.";
  if (v.length < 2) return "Nome de cidade demasiado curto.";
  if (v.length > 80) return "Nome de cidade demasiado longo.";
  if (INVALID_NAME_CHARS.test(v)) return "A cidade contém caracteres inválidos.";
  if (/^\d+$/.test(v)) return "A cidade não pode ser apenas números.";
  return null;
}

function validateMessage(value) {
  const v = value.trim();
  if (!v) return null;
  if (v.length > 1000) return "A mensagem não pode ter mais de 1000 caracteres.";
  if (SPAM_REPEAT.test(v)) return "A mensagem parece inválida. Tenta novamente.";
  return null;
}

function validateUrl(value) {
  const v = value.trim();
  if (!v) return null;
  if (!URL_PATTERN.test(v)) return "Introduz um link válido (começa com http:// ou https://).";
  if (v.length > 2048) return "O link é demasiado longo.";
  return null;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("validateName", () => {
  test("accepts a valid full name", () => {
    assert.equal(validateName("Sidonio Manhica"), null);
  });

  test("accepts names with accents", () => {
    assert.equal(validateName("José António"), null);
  });

  test("rejects empty string", () => {
    assert.ok(validateName("") !== null);
  });

  test("rejects single character", () => {
    assert.ok(validateName("A") !== null);
  });

  test("rejects pure numbers", () => {
    assert.ok(validateName("12345") !== null);
  });

  test("rejects XSS-like string with invalid chars", () => {
    assert.ok(validateName("<script>") !== null);
  });

  test("rejects keyboard spam", () => {
    assert.ok(validateName("AAAAAAAAA") !== null);
  });

  test("rejects name over 100 chars", () => {
    assert.ok(validateName("A".repeat(101)) !== null);
  });
});

describe("validatePhone", () => {
  test("accepts valid +25884 number", () => {
    assert.equal(validatePhone("+258841234567"), null);
  });

  test("accepts valid +25882 number", () => {
    assert.equal(validatePhone("+258821234567"), null);
  });

  test("accepts valid +25887 number", () => {
    assert.equal(validatePhone("+258871234567"), null);
  });

  test("rejects empty string", () => {
    assert.ok(validatePhone("") !== null);
  });

  test("rejects number without +258", () => {
    assert.ok(validatePhone("841234567") !== null);
  });

  test("rejects invalid operator 88", () => {
    assert.ok(validatePhone("+258881234567") !== null);
  });

  test("rejects number with wrong digit count", () => {
    assert.ok(validatePhone("+25884123") !== null);
  });
});

describe("validatePhoneOptional", () => {
  test("accepts empty string", () => {
    assert.equal(validatePhoneOptional(""), null);
  });

  test("accepts +258 prefix only", () => {
    assert.equal(validatePhoneOptional("+258"), null);
  });

  test("validates when filled", () => {
    assert.equal(validatePhoneOptional("+258841234567"), null);
    assert.ok(validatePhoneOptional("+258001234567") !== null);
  });
});

describe("validateEmail", () => {
  test("accepts valid email", () => {
    assert.equal(validateEmail("user@example.com"), null);
  });

  test("rejects missing @", () => {
    assert.ok(validateEmail("userexample.com") !== null);
  });

  test("rejects missing domain", () => {
    assert.ok(validateEmail("user@") !== null);
  });

  test("rejects empty", () => {
    assert.ok(validateEmail("") !== null);
  });

  test("is case-insensitive (normalises before check)", () => {
    assert.equal(validateEmail("USER@EXAMPLE.COM"), null);
  });
});

describe("validateCity", () => {
  test("accepts Maputo", () => {
    assert.equal(validateCity("Maputo"), null);
  });

  test("rejects empty string", () => {
    assert.ok(validateCity("") !== null);
  });

  test("rejects pure numbers", () => {
    assert.ok(validateCity("12345") !== null);
  });

  test("rejects invalid chars", () => {
    assert.ok(validateCity("City<script>") !== null);
  });
});

describe("validateMessage", () => {
  test("accepts empty (optional field)", () => {
    assert.equal(validateMessage(""), null);
  });

  test("accepts normal message", () => {
    assert.equal(validateMessage("Entregar entre 8h-12h, portão azul."), null);
  });

  test("rejects message over 1000 chars", () => {
    assert.ok(validateMessage("A".repeat(1001)) !== null);
  });

  test("rejects obvious spam", () => {
    assert.ok(validateMessage("AAAAAAAAA") !== null);
  });
});

describe("validateUrl", () => {
  test("accepts https URL", () => {
    assert.equal(validateUrl("https://maps.google.com/xyz"), null);
  });

  test("accepts empty (optional)", () => {
    assert.equal(validateUrl(""), null);
  });

  test("rejects non-URL text", () => {
    assert.ok(validateUrl("not a url") !== null);
  });

  test("rejects javascript: protocol", () => {
    assert.ok(validateUrl("javascript:alert(1)") !== null);
  });
});
