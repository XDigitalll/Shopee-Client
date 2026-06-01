import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedXdigitalProxyPath } from "../lib/server/xdigital-proxy-allowlist.js";

test("/api/xdigital/products passa", () => {
  assert.equal(isAllowedXdigitalProxyPath(["products"], "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath(["products", "123"], "GET"), true);
});

test("/api/xdigital/cart passa autenticado", () => {
  assert.equal(isAllowedXdigitalProxyPath(["cart", "me"], "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath(["cart", "add"], "POST"), true);
});

test("/api/xdigital/admin/products retorna 403", () => {
  assert.equal(isAllowedXdigitalProxyPath(["admin", "products"], "GET"), false);
});

test("/api/xdigital/admin/finance retorna 403", () => {
  assert.equal(isAllowedXdigitalProxyPath(["admin", "finance"], "GET"), false);
});

test("/api/xdigital/actuator/health retorna 403", () => {
  assert.equal(isAllowedXdigitalProxyPath(["actuator", "health"], "GET"), false);
});

test("path desconhecido retorna 403", () => {
  assert.equal(isAllowedXdigitalProxyPath(["unknown", "endpoint"], "GET"), false);
});

test("customer/orders/attention-summary passa para autenticados", () => {
  assert.equal(isAllowedXdigitalProxyPath(["customer", "orders", "attention-summary"], "GET"), true);
});

test("admin/* continua bloqueado depois do allowlist fix", () => {
  assert.equal(isAllowedXdigitalProxyPath(["admin", "orders"], "GET"), false);
  assert.equal(isAllowedXdigitalProxyPath(["admin", "finance", "overview"], "GET"), false);
});

test("PATCH funciona apenas para paths permitidos", () => {
  assert.equal(isAllowedXdigitalProxyPath(["customer", "orders", "123", "mark-updates-seen"], "PATCH"), true);
  assert.equal(isAllowedXdigitalProxyPath(["customer", "orders", "123", "confirm-delivery"], "PATCH"), true);
  assert.equal(isAllowedXdigitalProxyPath(["orders", "123", "status"], "PATCH"), false);
});

test("PaySuite passa apenas no endpoint de criacao de pagamento do cliente", () => {
  assert.equal(isAllowedXdigitalProxyPath(["orders", "123", "payment", "paysuite"], "POST"), true);
  assert.equal(isAllowedXdigitalProxyPath(["orders", "123", "payment", "paysuite", "retry"], "POST"), true);
  assert.equal(isAllowedXdigitalProxyPath(["admin", "payments", "paysuite"], "POST"), false);
});

test("DELETE funciona apenas para paths permitidos", () => {
  assert.equal(isAllowedXdigitalProxyPath(["cart", "items", "123"], "DELETE"), true);
  assert.equal(isAllowedXdigitalProxyPath(["products", "123"], "DELETE"), false);
});
