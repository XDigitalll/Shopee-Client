/**
 * Field-level validators for all user-submitted form data.
 * Each validator returns null when valid, or a user-facing Portuguese error string.
 */

// Mozambican mobile numbers — operators 82-87, 9 digits after country code
const MZ_PHONE = /^\+258(82|83|84|85|86|87)\d{7}$/;

// RFC 5322–simplified email validation
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A name must contain at least two Unicode letters (allows accents, spaces, hyphens, apostrophes)
const NAME_LETTERS = /\p{L}/gu;

// Characters explicitly forbidden in name/city fields
const INVALID_NAME_CHARS = /[<>{}[\]\\|^`~@#$%*+=]/;

// Free-text fields: block 8+ identical consecutive characters (spam / mashing)
const SPAM_REPEAT = /(.)\1{7,}/;

// URL pattern: must start with http(s)://
const URL_PATTERN = /^https?:\/\/.+\..+/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countLetters(value: string): number {
  return (value.match(NAME_LETTERS) ?? []).length;
}

// ─── Validators ──────────────────────────────────────────────────────────────

/**
 * Personal name or full name.
 * Rules: 2–100 chars, at least 2 Unicode letters, no obvious junk chars.
 */
export function validateName(value: string): string | null {
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

/**
 * Mozambican phone number (required variant).
 * Accepts: +25884xxxxxxx, 25884xxxxxxx, 84xxxxxxx (normalised before calling).
 */
export function validatePhone(value: string): string | null {
  const v = value.trim();
  if (!v) return "O número de telefone é obrigatório.";
  if (!MZ_PHONE.test(v))
    return "Número inválido. Usa o formato +2588xxxxxxxx (82–87).";
  return null;
}

/**
 * Optional phone — only validates if a value is present.
 */
export function validatePhoneOptional(value: string): string | null {
  const v = value.trim();
  if (!v || v === "+258") return null;
  if (!MZ_PHONE.test(v))
    return "Número inválido. Usa o formato +2588xxxxxxxx (82–87).";
  return null;
}

/**
 * Email address.
 */
export function validateEmail(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return "O email é obrigatório.";
  if (!EMAIL_PATTERN.test(v)) return "Endereço de email inválido.";
  if (v.length > 254) return "Email demasiado longo.";
  return null;
}

/**
 * Optional email — only validates format when present.
 */
export function validateEmailOptional(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return validateEmail(v);
}

/**
 * City name.
 */
export function validateCity(value: string): string | null {
  const v = value.trim();
  if (!v) return "A cidade é obrigatória.";
  if (v.length < 2) return "Nome de cidade demasiado curto.";
  if (v.length > 80) return "Nome de cidade demasiado longo.";
  if (INVALID_NAME_CHARS.test(v)) return "A cidade contém caracteres inválidos.";
  if (/^\d+$/.test(v)) return "A cidade não pode ser apenas números.";
  return null;
}

/**
 * Neighborhood / Bairro.
 */
export function validateNeighborhood(value: string): string | null {
  const v = value.trim();
  if (!v) return "O bairro é obrigatório.";
  if (v.length < 2) return "Nome de bairro demasiado curto.";
  if (v.length > 120) return "Nome de bairro demasiado longo.";
  if (INVALID_NAME_CHARS.test(v)) return "O bairro contém caracteres inválidos.";
  return null;
}

/**
 * Street / Rua.
 */
export function validateStreet(value: string): string | null {
  const v = value.trim();
  if (!v) return "A rua é obrigatória.";
  if (v.length > 200) return "Morada demasiado longa (máx. 200 caracteres).";
  return null;
}

/**
 * House number / reference — optional, light check.
 */
export function validateHouseNumber(value: string): string | null {
  const v = value.trim();
  if (v.length > 50) return "Referência demasiado longa.";
  return null;
}

/**
 * Free-text customer message / notes.
 */
export function validateMessage(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > 1000) return "A mensagem não pode ter mais de 1000 caracteres.";
  if (SPAM_REPEAT.test(v)) return "A mensagem parece inválida. Tenta novamente.";
  return null;
}

/**
 * External URL (Google Maps link, product link, etc.)
 */
export function validateUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!URL_PATTERN.test(v)) return "Introduz um link válido (começa com http:// ou https://).";
  if (v.length > 2048) return "O link é demasiado longo.";
  return null;
}

/**
 * Password (new/change password screens).
 * Min 8 chars, at least one letter and one number.
 */
export function validatePassword(value: string): string | null {
  if (!value) return "A palavra-passe é obrigatória.";
  if (value.length < 8) return "A palavra-passe deve ter pelo menos 8 caracteres.";
  if (value.length > 128) return "A palavra-passe é demasiado longa.";
  if (!/\p{L}/u.test(value)) return "A palavra-passe deve conter pelo menos uma letra.";
  if (!/\d/.test(value)) return "A palavra-passe deve conter pelo menos um número.";
  return null;
}

/**
 * Run multiple validators against an object of form values.
 * Returns a record of fieldName → error string (only fields with errors).
 *
 * Usage:
 *   const errors = validateForm(form, {
 *     fullName:   (v) => validateName(v),
 *     primaryPhone: (v) => validatePhone(v),
 *   });
 */
export function validateForm<T extends Record<string, string>>(
  values: T,
  rules: Partial<Record<keyof T, (value: string) => string | null>>
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const field in rules) {
    const rule = rules[field];
    if (!rule) continue;
    const error = rule(values[field] ?? "");
    if (error) errors[field] = error;
  }
  return errors;
}

/**
 * Quick check: returns true if validateForm returns no errors.
 */
export function isFormValid<T extends Record<string, string>>(
  values: T,
  rules: Partial<Record<keyof T, (value: string) => string | null>>
): boolean {
  return Object.keys(validateForm(values, rules)).length === 0;
}
