import test from "node:test";
import assert from "node:assert/strict";

import { isAllowedXdigitalProxyPath } from "../lib/server/xdigital-proxy-allowlist.js";

test("catalog public endpoints are allowed through the xdigital proxy", () => {
  assert.equal(isAllowedXdigitalProxyPath("catalog/products", "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath("catalog/products/featured", "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath("catalog/products/iphone-15-pro", "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath("catalog/products/iphone-15-pro/related", "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath("catalog/categories", "GET"), true);
  assert.equal(isAllowedXdigitalProxyPath("catalog/brands", "GET"), true);
});

test("catalog order endpoint is allowed without exposing admin catalog writes", () => {
  assert.equal(isAllowedXdigitalProxyPath("catalog/products/iphone-15-pro/order", "POST"), true);
  assert.equal(isAllowedXdigitalProxyPath("admin/catalog/products", "GET"), false);
  assert.equal(isAllowedXdigitalProxyPath("catalog/products", "POST"), false);
});
