const BLOCKED_PREFIXES = [
  "admin",
  "super-admin",
  "finance",
  "internal",
  "management",
  "actuator",
  "debug",
  "payments/admin",
];

const ALLOWED_EXACT = new Map([
  ["GET", [
    "banners",
    "banners/public",
    "cart",
    "cart/me",
    "categories",
    "customer/orders/attention-summary",
    "me/profile",
    "orders/me",
    "orders/my-orders",
    "orders/my-stats",
    "payment-settings/public",
    "users/me",
    "users/me/addresses",
  ]],
  ["POST", [
    "auth/logout",
    "cart/add",
    "coupons/validate",
    "orders/external",
    "orders/from-cart",
    "users/me/addresses",
    "users/me/email-verification/request",
    "users/me/email-verification/confirm",
    "users/me/phone-verification/request",
    "users/me/phone-verification/confirm",
  ]],
  ["PUT", [
    "me/profile",
    "users/me",
    "users/me/notifications",
    "users/me/password",
  ]],
]);

function normalizePath(path) {
  const parts = Array.isArray(path) ? path : String(path || "").split("/");
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function isNumericSegment(value) {
  return /^\d+$/.test(value);
}

function isAllowedByPattern(method, path) {
  const segments = path.split("/");

  if (method === "GET") {
    if (segments[0] === "products") return segments.length <= 3;
    if (segments[0] === "categories") return segments.length <= 2;
    if (path.startsWith("public/")) return true;
    if (segments[0] === "tracking" && segments[1] === "public") return true;
    if (segments[0] === "api" && segments[1] === "public" && segments[2] === "track") return segments.length === 4;
  }

  if (method === "POST") {
    if (segments[0] === "auth") return segments.length === 2;
    if (segments[0] === "orders" && isNumericSegment(segments[1]) && segments[2] === "delivery-address" && segments[3] === "create") return segments.length === 4;
    // /sync must be checked BEFORE the bare /paysuite rule, because
    // "return segments.length === 4" would exit with false for 5-segment paths.
    if (segments[0] === "orders" && isNumericSegment(segments[1]) && segments[2] === "payment" && segments[3] === "paysuite" && segments[4] === "sync") return segments.length === 5;
    if (segments[0] === "orders" && isNumericSegment(segments[1]) && segments[2] === "payment" && segments[3] === "paysuite") return segments.length === 4;
    if (segments[0] === "orders" && segments[1] && segments[2] === "payment-proof" && segments[3] === "public") return segments.length === 4;
  }

  if (method === "PUT") {
    if (segments[0] === "cart" && segments[1] === "items" && isNumericSegment(segments[2])) return segments.length === 3;
    if (segments[0] === "orders" && isNumericSegment(segments[1])) {
      return [
        "approve",
        "cancel",
        "confirm-received",
      ].includes(segments[2]) && segments.length === 3
        || segments[2] === "delivery-address" && segments[3] === "select" && segments.length === 4;
    }
    if (segments[0] === "orders" && segments[1] && segments[2] === "delivery" && segments[3] === "public") return segments.length === 4;
  }

  if (method === "PATCH") {
    if (segments[0] === "customer" && segments[1] === "orders" && isNumericSegment(segments[2]) && segments[3] === "mark-updates-seen") return segments.length === 4;
    if (segments[0] === "customer" && segments[1] === "orders" && isNumericSegment(segments[2]) && segments[3] === "confirm-delivery") return segments.length === 4;
  }

  if (method === "DELETE") {
    if (segments[0] === "cart" && segments[1] === "items" && isNumericSegment(segments[2])) return segments.length === 3;
    if (segments[0] === "users" && segments[1] === "me" && segments[2] === "addresses" && isNumericSegment(segments[3])) return segments.length === 4;
  }

  return false;
}

function isAllowedXdigitalProxyPath(path, method = "GET") {
  const normalizedPath = normalizePath(path);
  const normalizedMethod = String(method || "GET").toUpperCase();

  if (!normalizedPath) {
    return false;
  }

  if (BLOCKED_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`))) {
    return false;
  }

  const exact = ALLOWED_EXACT.get(normalizedMethod);
  if (exact?.includes(normalizedPath)) {
    return true;
  }

  return isAllowedByPattern(normalizedMethod, normalizedPath);
}

module.exports = {
  BLOCKED_PREFIXES,
  isAllowedXdigitalProxyPath,
};
