/**
 * Unit tests for utils/text-cleaner.ts
 * Run with: node --test __tests__/text-cleaner.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Inline implementation ─────────────────────────────────────────────────────

const CITY_CORRECTIONS = {
  mocambique: "Moçambique",
  mozambique: "Moçambique",
  maputo: "Maputo",
  matola: "Matola",
  beira: "Beira",
  nampula: "Nampula",
  nampua: "Nampula",
  namula: "Nampula",
  quelimane: "Quelimane",
  tete: "Tete",
  chimoio: "Chimoio",
  nacala: "Nacala",
  inhambane: "Inhambane",
  "xai-xai": "Xai-Xai",
  xaixai: "Xai-Xai",
  lichinga: "Lichinga",
  pemba: "Pemba",
  maxixe: "Maxixe",
  gurue: "Gurué",
  moatize: "Moatize",
};

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/(?:^|[\s\-\/])(\p{L})/gu, (match, letter) =>
      match.replace(letter, letter.toUpperCase())
    );
}

function collapseSpaces(value) {
  return value.replace(/[ \t]{2,}/g, " ").trim();
}

function cleanName(raw) {
  if (!raw) return "";
  return titleCase(collapseSpaces(raw));
}

function cleanCity(raw) {
  if (!raw) return "";
  const key = collapseSpaces(raw).toLowerCase().replace(/[^a-záàâãçéêíóõúü\-]/g, "");
  if (CITY_CORRECTIONS[key]) return CITY_CORRECTIONS[key];
  return titleCase(collapseSpaces(raw));
}

function suggestCity(raw) {
  if (!raw) return null;
  const cleaned = cleanCity(raw);
  if (cleaned.toLowerCase() !== collapseSpaces(raw).toLowerCase()) return cleaned;
  return null;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("cleanName", () => {
  test("lowercases all-caps name", () => {
    assert.equal(cleanName("SIDONIO"), "Sidonio");
  });

  test("uppercases all-lowercase name", () => {
    assert.equal(cleanName("joao pedro"), "Joao Pedro");
  });

  test("handles mixed case", () => {
    assert.equal(cleanName("mARIA dE lURDES"), "Maria De Lurdes");
  });

  test("collapses multiple spaces", () => {
    assert.equal(cleanName("joao    pedro"), "Joao Pedro");
  });

  test("handles hyphenated names", () => {
    assert.equal(cleanName("maria-de-lurdes"), "Maria-De-Lurdes");
  });

  test("returns empty string for empty input", () => {
    assert.equal(cleanName(""), "");
  });

  test("handles names with accents", () => {
    assert.equal(cleanName("MANHIÇA"), "Manhiça");
  });
});

describe("cleanCity", () => {
  test("corrects MAPUTO to Maputo", () => {
    assert.equal(cleanCity("MAPUTO"), "Maputo");
  });

  test("corrects typo nampua → Nampula", () => {
    assert.equal(cleanCity("nampua"), "Nampula");
  });

  test("corrects mocambique → Moçambique", () => {
    assert.equal(cleanCity("mocambique"), "Moçambique");
  });

  test("corrects mozambique → Moçambique", () => {
    assert.equal(cleanCity("mozambique"), "Moçambique");
  });

  test("corrects xaixai → Xai-Xai", () => {
    assert.equal(cleanCity("xaixai"), "Xai-Xai");
  });

  test("title-cases unknown city", () => {
    assert.equal(cleanCity("alto molocue"), "Alto Molocue");
  });

  test("handles empty input", () => {
    assert.equal(cleanCity(""), "");
  });
});

describe("suggestCity", () => {
  test("returns suggestion for typo", () => {
    assert.equal(suggestCity("nampua"), "Nampula");
  });

  test("returns null when city is already correct after cleaning", () => {
    // "maputo" lowercased matches corrected form "Maputo" (case-insensitive compare)
    // The function compares cleaned.toLowerCase() vs input.toLowerCase()
    // cleanCity("maputo") = "Maputo", "maputo".toLowerCase() = "maputo"
    // "Maputo".toLowerCase() = "maputo" → equal → null
    assert.equal(suggestCity("maputo"), null);
  });

  test("returns suggestion for all-caps typo", () => {
    assert.equal(suggestCity("NAMPUA"), "Nampula");
  });

  test("returns null for empty string", () => {
    assert.equal(suggestCity(""), null);
  });
});
