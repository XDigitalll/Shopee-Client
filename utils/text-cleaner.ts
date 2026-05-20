/**
 * Smart text normalisation for human-readable fields.
 * Never use on passwords, emails, tokens, codes, or URLs.
 */

// Known Mozambican city name corrections (normalised → display form)
const CITY_CORRECTIONS: Record<string, string> = {
  "mocambique": "Moçambique",
  "mozambique": "Moçambique",
  "maputo": "Maputo",
  "matola": "Matola",
  "beira": "Beira",
  "nampula": "Nampula",
  "nampua": "Nampula",
  "namula": "Nampula",
  "quelimane": "Quelimane",
  "tete": "Tete",
  "chimoio": "Chimoio",
  "nacala": "Nacala",
  "inhambane": "Inhambane",
  "xai-xai": "Xai-Xai",
  "xaixai": "Xai-Xai",
  "lichinga": "Lichinga",
  "pemba": "Pemba",
  "maxixe": "Maxixe",
  "mocuba": "Mocuba",
  "gurué": "Gurué",
  "gurue": "Gurué",
  "moatize": "Moatize",
  "cuamba": "Cuamba",
};

/**
 * Capitalise each word's first letter, lowercase the rest.
 *
 * Handles hyphenated names correctly:
 *   "xai-xai"  → "Xai-Xai"
 *   "SIDONIO"  → "Sidonio"
 *   "mAPUTO"   → "Maputo"
 */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(?:^|[\s\-\/])(\p{L})/gu, (match, letter) =>
      match.replace(letter, letter.toUpperCase())
    );
}

/**
 * Collapse multiple consecutive spaces into one.
 */
function collapseSpaces(value: string): string {
  return value.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Clean and capitalise a personal name.
 *   "joao    pedro"  → "Joao Pedro"
 *   "SIDONIO MANHIÇA" → "Sidonio Manhiça"
 *   "maria-de-lurdes" → "Maria-De-Lurdes"
 */
export function cleanName(raw: string): string {
  if (!raw) return "";
  return titleCase(collapseSpaces(raw));
}

/**
 * Clean and capitalise a city name, applying known Mozambican corrections.
 * Returns the corrected form when a match is found, otherwise title-cases.
 *   "MAPUTO"     → "Maputo"
 *   "nampua"     → "Nampula"   (typo suggestion)
 *   "mocambique" → "Moçambique"
 */
export function cleanCity(raw: string): string {
  if (!raw) return "";
  const key = collapseSpaces(raw).toLowerCase().replace(/[^a-záàâãçéêíóõúü\-]/g, "");
  if (CITY_CORRECTIONS[key]) return CITY_CORRECTIONS[key];
  return titleCase(collapseSpaces(raw));
}

/**
 * Returns a city suggestion if the input looks like a known typo/variant,
 * or null if the input is already correct or unrecognised.
 *   "nampua"   → "Nampula"
 *   "maputo"   → null  (already matches after clean)
 *   "somewhere" → null
 */
export function suggestCity(raw: string): string | null {
  if (!raw) return null;
  const cleaned = cleanCity(raw);
  if (cleaned.toLowerCase() !== collapseSpaces(raw).toLowerCase()) {
    return cleaned;
  }
  return null;
}

/**
 * Clean and capitalise a neighborhood/bairro/street name.
 * Same as cleanName but preserves abbreviations like "Av.", "R.", "Rua".
 */
export function cleanAddress(raw: string): string {
  if (!raw) return "";
  return titleCase(collapseSpaces(raw));
}

/**
 * Remove stray whitespace from a house number / reference.
 * Does NOT change case — "Bloco A" stays as entered.
 */
export function cleanHouseNumber(raw: string): string {
  return collapseSpaces(raw);
}

/**
 * Collapse spaces and trim a free-text message but do NOT change capitalisation.
 * The user may write in any style they prefer.
 */
export function cleanMessage(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\r\n|\r/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

export type FieldType = "name" | "city" | "address" | "houseNumber" | "message";

/**
 * Route a raw value through the correct cleaner based on field type.
 * Use this to normalise form fields on blur or submit.
 */
export function cleanField(type: FieldType, raw: string): string {
  switch (type) {
    case "name":    return cleanName(raw);
    case "city":    return cleanCity(raw);
    case "address": return cleanAddress(raw);
    case "houseNumber": return cleanHouseNumber(raw);
    case "message": return cleanMessage(raw);
  }
}
