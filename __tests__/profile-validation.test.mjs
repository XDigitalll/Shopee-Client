/**
 * Unit tests for profile page validation logic.
 * Mirrors the validatePersonalForm and validateAddressForm logic added to profile/page.tsx.
 * Run with: node --test __tests__/profile-validation.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Inline validators (mirrors validators.ts) ─────────────────────────────────

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

function validatePhoneOptional(value) {
  const v = value.trim();
  if (!v || v === "+258") return null;
  if (!MZ_PHONE.test(v)) return "Número inválido. Usa o formato +2588xxxxxxxx (82–87).";
  return null;
}

function validateEmailOptional(value) {
  const v = value.trim();
  if (!v) return null;
  const v2 = v.toLowerCase();
  if (!EMAIL_PATTERN.test(v2)) return "Endereço de email inválido.";
  if (v2.length > 254) return "Email demasiado longo.";
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

function validateNeighborhood(value) {
  const v = value.trim();
  if (!v) return "O bairro é obrigatório.";
  if (v.length < 2) return "Nome de bairro demasiado curto.";
  if (v.length > 120) return "Nome de bairro demasiado longo.";
  if (INVALID_NAME_CHARS.test(v)) return "O bairro contém caracteres inválidos.";
  return null;
}

function validateStreet(value) {
  const v = value.trim();
  if (!v) return "A rua é obrigatória.";
  if (v.length > 200) return "Morada demasiado longa (máx. 200 caracteres).";
  return null;
}

function validateUrl(value) {
  const v = value.trim();
  if (!v) return null;
  if (!URL_PATTERN.test(v)) return "Introduz um link válido (começa com http:// ou https://).";
  if (v.length > 2048) return "O link é demasiado longo.";
  return null;
}

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00258")) return `+${digits.slice(2)}`;
  if (digits.startsWith("258")) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return raw.trim();
}

// ── Validate personal form (mirrors profile/page.tsx logic) ──────────────────

function validatePersonalForm(personalForm, isXdigitalEmail) {
  const errors = {};
  const firstErr = validateName(personalForm.firstName);
  if (firstErr) errors.firstName = firstErr;
  const lastErr = validateName(personalForm.lastName);
  if (lastErr) errors.lastName = lastErr;
  if (isXdigitalEmail && personalForm.email) {
    const emailErr = validateEmailOptional(personalForm.email);
    if (emailErr) errors.email = emailErr;
  }
  const normalised = personalForm.phoneNumber.trim() ? normalizePhone(personalForm.phoneNumber) : "";
  const phoneErr = validatePhoneOptional(normalised);
  if (phoneErr) errors.phoneNumber = phoneErr;
  if (personalForm.city) {
    const cityErr = validateCity(personalForm.city);
    if (cityErr) errors.city = cityErr;
  }
  return errors;
}

function validateAddressForm(addressForm) {
  const errors = {};
  if (!addressForm.label.trim()) errors.label = "Nome da morada é obrigatório.";
  const cityErr = validateCity(addressForm.city);
  if (cityErr) errors.city = cityErr;
  const nbErr = validateNeighborhood(addressForm.neighborhood);
  if (nbErr) errors.neighborhood = nbErr;
  const streetErr = validateStreet(addressForm.street);
  if (streetErr) errors.street = streetErr;
  if (addressForm.googleMapsLink) {
    const urlErr = validateUrl(addressForm.googleMapsLink);
    if (urlErr) errors.googleMapsLink = urlErr;
  }
  return errors;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validatePersonalForm", () => {
  const baseForm = {
    firstName: "Maria",
    lastName: "Sitoe",
    email: "",
    phoneNumber: "",
    birthDate: "",
    gender: "",
    city: "",
  };

  test("valid form with no optional fields returns no errors", () => {
    const errors = validatePersonalForm(baseForm, false);
    assert.equal(Object.keys(errors).length, 0);
  });

  test("empty firstName returns error", () => {
    const errors = validatePersonalForm({ ...baseForm, firstName: "" }, false);
    assert.ok(errors.firstName);
  });

  test("empty lastName returns error", () => {
    const errors = validatePersonalForm({ ...baseForm, lastName: "" }, false);
    assert.ok(errors.lastName);
  });

  test("valid Mozambican phone is accepted", () => {
    const errors = validatePersonalForm({ ...baseForm, phoneNumber: "+258841234567" }, false);
    assert.equal(errors.phoneNumber, undefined);
  });

  test("9-digit phone is normalised and accepted", () => {
    const errors = validatePersonalForm({ ...baseForm, phoneNumber: "841234567" }, false);
    assert.equal(errors.phoneNumber, undefined);
  });

  test("invalid phone operator (81) returns error", () => {
    const errors = validatePersonalForm({ ...baseForm, phoneNumber: "+258811234567" }, false);
    assert.ok(errors.phoneNumber);
  });

  test("valid city is accepted", () => {
    const errors = validatePersonalForm({ ...baseForm, city: "Maputo" }, false);
    assert.equal(errors.city, undefined);
  });

  test("city with invalid chars returns error", () => {
    const errors = validatePersonalForm({ ...baseForm, city: "Map<uto>" }, false);
    assert.ok(errors.city);
  });

  test("xdigital email validated when present and isXdigitalEmail=true", () => {
    const errors = validatePersonalForm({ ...baseForm, email: "not-an-email" }, true);
    assert.ok(errors.email);
  });

  test("xdigital email not validated when isXdigitalEmail=false", () => {
    const errors = validatePersonalForm({ ...baseForm, email: "not-an-email" }, false);
    assert.equal(errors.email, undefined);
  });

  test("valid email accepted for xdigital account", () => {
    const errors = validatePersonalForm({ ...baseForm, email: "maria@example.com" }, true);
    assert.equal(errors.email, undefined);
  });
});

describe("validateAddressForm", () => {
  const baseAddr = {
    label: "Casa",
    city: "Maputo",
    neighborhood: "Sommerschield",
    street: "Av. Julius Nyerere",
    houseNumber: "123",
    reference: "",
    googleMapsLink: "",
    defaultAddress: false,
  };

  test("valid address returns no errors", () => {
    const errors = validateAddressForm(baseAddr);
    assert.equal(Object.keys(errors).length, 0);
  });

  test("empty label returns error", () => {
    const errors = validateAddressForm({ ...baseAddr, label: "" });
    assert.ok(errors.label);
  });

  test("empty city returns error", () => {
    const errors = validateAddressForm({ ...baseAddr, city: "" });
    assert.ok(errors.city);
  });

  test("empty neighborhood returns error", () => {
    const errors = validateAddressForm({ ...baseAddr, neighborhood: "" });
    assert.ok(errors.neighborhood);
  });

  test("empty street returns error", () => {
    const errors = validateAddressForm({ ...baseAddr, street: "" });
    assert.ok(errors.street);
  });

  test("valid Google Maps URL is accepted", () => {
    const errors = validateAddressForm({ ...baseAddr, googleMapsLink: "https://maps.google.com/test" });
    assert.equal(errors.googleMapsLink, undefined);
  });

  test("invalid Google Maps URL returns error", () => {
    const errors = validateAddressForm({ ...baseAddr, googleMapsLink: "not-a-url" });
    assert.ok(errors.googleMapsLink);
  });

  test("empty googleMapsLink (optional) is accepted", () => {
    const errors = validateAddressForm({ ...baseAddr, googleMapsLink: "" });
    assert.equal(errors.googleMapsLink, undefined);
  });
});
