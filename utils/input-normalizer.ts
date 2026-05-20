/**
 * Central input sanitization for all user-submitted text fields.
 * Never use on passwords, tokens, or binary data.
 */

// Invisible/zero-width unicode — explicit \u escapes to avoid embedding literal invisible chars
// Covers: soft hyphen, zero-width space/non-joiner/joiner, word joiner, BOM, various format chars
const ZERO_WIDTH_PATTERN =
  /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ￰-￿]/g;

// Explicitly dangerous HTML tags that indicate injection attempts — checked BEFORE stripping
const DANGEROUS_TAG_PATTERN =
  /<(script|iframe|object|embed|form|svg|math|link|meta|base)\b/gi;

// Remaining HTML tags — stripped after dangerous ones are caught
const HTML_TAG_PATTERN = /<[^>]*>/gi;

// Dangerous attribute patterns: onerror=, onclick=, onload=, javascript:, data:text/html
const DANGEROUS_ATTR_PATTERN =
  /\bon\w+\s*=|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/gi;

// SQL injection patterns unambiguously suspicious in name/address fields.
// Allows apostrophes in names (O'Brien) but blocks clear injection attempts.
const SQL_INJECTION_PATTERN =
  /('|")\s*(OR|AND|UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|CAST|CONVERT)\s/gi;

// Repeated junk: "AAAAAAA", "11111", ".....", "?????" — 8+ identical chars
const SPAM_REPEAT_PATTERN = /(.)\1{7,}/g;

export type NormalizeResult = {
  value: string;
  blocked: boolean;
  reason?: "xss" | "sql" | "spam";
};

/**
 * Baseline normalizer: trim, collapse whitespace, strip invisible chars.
 * Safe to use on any text field.
 */
export function normalizeWhitespace(raw: string): string {
  return raw
    .replace(ZERO_WIDTH_PATTERN, "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Full sanitizer for name/address/city/neighborhood/message fields.
 * Returns the cleaned value and a blocked flag if an injection attempt is detected.
 *
 * Order of checks:
 *   1. Dangerous HTML tags (script, iframe, etc.) → blocked: xss
 *   2. Dangerous event-handler attributes or JS protocols → blocked: xss
 *   3. SQL injection keywords after quotes → blocked: sql
 *   4. Keyboard spam (8+ identical chars) → blocked: spam
 *   5. Strip remaining benign HTML tags from the value
 */
export function sanitizeTextField(raw: string): NormalizeResult {
  if (!raw) return { value: "", blocked: false };

  const value = normalizeWhitespace(raw);

  // 1. Dangerous tags — must check before stripping
  DANGEROUS_TAG_PATTERN.lastIndex = 0;
  if (DANGEROUS_TAG_PATTERN.test(value)) {
    return { value: "", blocked: true, reason: "xss" };
  }

  // 2. Event-handler attributes and dangerous protocols
  DANGEROUS_ATTR_PATTERN.lastIndex = 0;
  if (DANGEROUS_ATTR_PATTERN.test(value)) {
    return { value: "", blocked: true, reason: "xss" };
  }

  // 3. SQL injection
  SQL_INJECTION_PATTERN.lastIndex = 0;
  if (SQL_INJECTION_PATTERN.test(value)) {
    return { value: "", blocked: true, reason: "sql" };
  }

  // 4. Keyboard spam
  SPAM_REPEAT_PATTERN.lastIndex = 0;
  if (SPAM_REPEAT_PATTERN.test(value)) {
    return { value: "", blocked: true, reason: "spam" };
  }

  // 5. Strip any remaining benign HTML tags
  const clean = value.replace(HTML_TAG_PATTERN, "").trim();
  return { value: clean, blocked: false };
}

/**
 * Lightweight normalizer for codes/references (no HTML/SQL checks).
 * Only collapses spaces, removes invisible chars, and uppercases.
 */
export function normalizeCode(raw: string): string {
  return normalizeWhitespace(raw).toUpperCase();
}

/**
 * Normalises a phone number toward the Mozambican E.164 standard.
 *   "841234567"      → "+258841234567"
 *   "00258841234567" → "+258841234567"
 *   "+258841234567"  → "+258841234567"
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00258")) return `+${digits.slice(2)}`;
  if (digits.startsWith("258")) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;

  if (raw.trim().startsWith("+")) return `+${digits}`;

  return raw.trim();
}

/**
 * Normalises an email: lowercase and trim.
 * Does not validate — use validators.ts for that.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Sanitize a URL: only allow http:// and https:// protocols.
 * Returns null for anything suspicious (javascript:, data:, etc).
 */
export function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return trimmed;
    return null;
  } catch {
    return null;
  }
}
