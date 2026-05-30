/**
 * Unit tests for the payment sync logic in app/(client)/orders/[id]/payment/page.tsx
 *
 * Pure helpers are inlined here so the tests run without a DOM / React runtime.
 * The mutex tests simulate the syncInFlightRef pattern from the page component.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// ── Pure helpers (mirrors page.tsx exports) ───────────────────────────────

function classifySyncResult(status) {
  const s = (status ?? "").toLowerCase();
  if (["success", "completed", "paid", "confirmed"].includes(s)) return "confirmed";
  if (["failed", "cancelled", "canceled", "expired", "rejected"].includes(s)) return "failed";
  return "pending";
}

function isActivePaySuitePayment(p) {
  if (!p) return false;
  const s = (p.status ?? "").toUpperCase();
  return ["PENDING", "PROCESSING", "WAITING"].includes(s) && !!(p.providerReference || p.checkoutUrl);
}

function shouldBlockDuplicatePayment(p) {
  return isActivePaySuitePayment(p);
}

// Simulates the mutex used in performSync() — syncInFlightRef.current
function createSyncMutex(syncFn) {
  let inFlight = false;
  return async function guardedSync() {
    if (inFlight) return "blocked";
    inFlight = true;
    try {
      return await syncFn();
    } finally {
      inFlight = false;
    }
  };
}

// ── classifySyncResult ────────────────────────────────────────────────────

describe("classifySyncResult", () => {
  it("SUCCESS → confirmed", () => {
    assert.equal(classifySyncResult("SUCCESS"), "confirmed");
  });

  it("completed → confirmed", () => {
    assert.equal(classifySyncResult("completed"), "confirmed");
  });

  it("paid → confirmed", () => {
    assert.equal(classifySyncResult("paid"), "confirmed");
  });

  it("confirmed → confirmed", () => {
    assert.equal(classifySyncResult("confirmed"), "confirmed");
  });

  it("undefined / null / empty → pending", () => {
    assert.equal(classifySyncResult(undefined), "pending");
    assert.equal(classifySyncResult(null), "pending");
    assert.equal(classifySyncResult(""), "pending");
  });

  it("PENDING → pending", () => {
    assert.equal(classifySyncResult("PENDING"), "pending");
  });

  it("failed → failed", () => {
    assert.equal(classifySyncResult("failed"), "failed");
  });

  it("cancelled / canceled / expired / rejected → failed", () => {
    assert.equal(classifySyncResult("cancelled"), "failed");
    assert.equal(classifySyncResult("canceled"), "failed");
    assert.equal(classifySyncResult("expired"), "failed");
    assert.equal(classifySyncResult("rejected"), "failed");
  });
});

// ── isActivePaySuitePayment ───────────────────────────────────────────────

describe("isActivePaySuitePayment", () => {
  it("PENDING with providerReference → active", () => {
    assert.ok(isActivePaySuitePayment({ status: "PENDING", providerReference: "REF-123" }));
  });

  it("PROCESSING with checkoutUrl → active", () => {
    assert.ok(isActivePaySuitePayment({ status: "PROCESSING", checkoutUrl: "https://pay.example.com" }));
  });

  it("WAITING with providerReference → active", () => {
    assert.ok(isActivePaySuitePayment({ status: "WAITING", providerReference: "REF-456" }));
  });

  it("SUCCESS → not active (payment confirmed)", () => {
    assert.ok(!isActivePaySuitePayment({ status: "SUCCESS", providerReference: "REF-123" }));
  });

  it("PENDING without providerReference or checkoutUrl → not active", () => {
    assert.ok(!isActivePaySuitePayment({ status: "PENDING" }));
  });

  it("null → not active", () => {
    assert.ok(!isActivePaySuitePayment(null));
  });

  it("undefined → not active", () => {
    assert.ok(!isActivePaySuitePayment(undefined));
  });

  it("FAILED → not active (can retry)", () => {
    assert.ok(!isActivePaySuitePayment({ status: "FAILED", providerReference: "REF-789" }));
  });
});

// ── shouldBlockDuplicatePayment (rule 7) ─────────────────────────────────

describe("shouldBlockDuplicatePayment", () => {
  it("PENDING with ref → blocks (rule 7)", () => {
    assert.ok(shouldBlockDuplicatePayment({ status: "PENDING", providerReference: "REF-1" }));
  });

  it("PENDING with checkoutUrl but no ref → blocks", () => {
    assert.ok(shouldBlockDuplicatePayment({ status: "PENDING", checkoutUrl: "https://pay.example.com" }));
  });

  it("SUCCESS → does not block (already confirmed)", () => {
    assert.ok(!shouldBlockDuplicatePayment({ status: "SUCCESS", providerReference: "REF-1" }));
  });

  it("FAILED → does not block (can retry)", () => {
    assert.ok(!shouldBlockDuplicatePayment({ status: "FAILED", providerReference: "REF-1" }));
  });

  it("null → does not block (no payment yet)", () => {
    assert.ok(!shouldBlockDuplicatePayment(null));
  });
});

// ── Mutex anti-spam (rules 1 & 2) ────────────────────────────────────────

describe("sync mutex — button disabled during sync, parallel calls blocked", () => {
  it("second call is blocked while first is in flight", async () => {
    let gatewayCallCount = 0;
    const slowSync = createSyncMutex(async () => {
      gatewayCallCount++;
      await new Promise((r) => setTimeout(r, 40));
      return "done";
    });

    // Fire two calls at the same time — only one must reach the gateway.
    const [r1, r2] = await Promise.all([slowSync(), slowSync()]);
    assert.ok(
      (r1 === "done" && r2 === "blocked") || (r1 === "blocked" && r2 === "done"),
      "exactly one call must be blocked",
    );
    assert.equal(gatewayCallCount, 1, "gateway called exactly once");
  });

  it("multiple rapid clicks → exactly one gateway call", async () => {
    let calls = 0;
    const guardedSync = createSyncMutex(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
    });

    await Promise.all([guardedSync(), guardedSync(), guardedSync(), guardedSync()]);
    assert.equal(calls, 1, "only one gateway call despite four clicks");
  });

  it("after first sync completes a new sync can run", async () => {
    let calls = 0;
    const guardedSync = createSyncMutex(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
    });

    await guardedSync();        // first — completes
    await guardedSync();        // second — runs because mutex released
    assert.equal(calls, 2, "second sync runs after first completes");
  });
});

// ── Duplicate payment block (rule 7) ─────────────────────────────────────

describe("duplicate payment blocking", () => {
  it("pending payment blocks createPayment (rule 7)", () => {
    const payment = { status: "PENDING", providerReference: "REF-1" };
    assert.ok(shouldBlockDuplicatePayment(payment), "must block when payment is PENDING");
  });

  it("confirmed payment does not block retry if needed", () => {
    const payment = { status: "SUCCESS", providerReference: "REF-1" };
    assert.ok(!shouldBlockDuplicatePayment(payment), "must not block when payment is SUCCESS");
  });

  it("failed / cancelled allows new payment attempt (rule 5)", () => {
    assert.ok(!shouldBlockDuplicatePayment({ status: "FAILED", providerReference: "REF-1" }));
    assert.ok(!shouldBlockDuplicatePayment({ status: "CANCELLED", providerReference: "REF-1" }));
  });
});

// ── canPay / canRetryAfterTimeout gate conditions ─────────────────────────

describe("payment form visibility gates", () => {
  function computeCanPay({ orderStatus, paysuitePayment, returnPhase }) {
    const hasActive = isActivePaySuitePayment(paysuitePayment);
    return (
      (orderStatus === "PENDING_PAYMENT" || orderStatus === "PAYMENT_REJECTED")
      && !hasActive
      && returnPhase === "idle"
    );
  }

  function computeCanRetryAfterTimeout({ returnPhase, orderStatus, paysuitePayment }) {
    const hasActive = isActivePaySuitePayment(paysuitePayment);
    return returnPhase === "timed_out" && orderStatus === "PAYMENT_REJECTED" && !hasActive;
  }

  it("psr=1 confirming phase — canPay is false, form hidden", () => {
    const canPay = computeCanPay({ orderStatus: "PENDING_PAYMENT", paysuitePayment: null, returnPhase: "confirming" });
    assert.ok(!canPay, "form must be hidden during confirming phase");
  });

  it("psr=1 timed_out without failure — canPay is false, no pay button", () => {
    const canPay = computeCanPay({ orderStatus: "PENDING_PAYMENT", paysuitePayment: null, returnPhase: "timed_out" });
    assert.ok(!canPay, "pay button must not appear in timed_out without explicit failure");
  });

  it("timed_out with PAYMENT_REJECTED — canRetryAfterTimeout is true", () => {
    const canRetry = computeCanRetryAfterTimeout({ returnPhase: "timed_out", orderStatus: "PAYMENT_REJECTED", paysuitePayment: null });
    assert.ok(canRetry, "retry allowed after timeout when backend reported failure");
  });

  it("timed_out with PENDING_PAYMENT (no explicit failure) — canRetryAfterTimeout is false", () => {
    const canRetry = computeCanRetryAfterTimeout({ returnPhase: "timed_out", orderStatus: "PENDING_PAYMENT", paysuitePayment: null });
    assert.ok(!canRetry, "must not allow pay again when backend has not reported failure");
  });

  it("idle phase, PENDING_PAYMENT, no active payment — canPay is true", () => {
    const canPay = computeCanPay({ orderStatus: "PENDING_PAYMENT", paysuitePayment: null, returnPhase: "idle" });
    assert.ok(canPay, "form must be shown in idle phase with no active payment");
  });

  it("idle phase, active PENDING PaySuite tx — canPay is false", () => {
    const canPay = computeCanPay({
      orderStatus: "PENDING_PAYMENT",
      paysuitePayment: { status: "PENDING", providerReference: "REF-1" },
      returnPhase: "idle",
    });
    assert.ok(!canPay, "form must be hidden when PaySuite tx is active");
  });
});

// ── Full sync flow simulation (rules 3, 4, 5, 6) ─────────────────────────

describe("full sync flow outcomes", () => {
  async function simulateSync(gatewayStatus) {
    const events = [];
    let currentReturnPhase = "idle";
    let currentFeedback = null;

    const outcome = classifySyncResult(gatewayStatus);

    if (outcome === "confirmed") {
      events.push("PAYMENT_SYNC_CONFIRMED");
      currentReturnPhase = "confirmed";
      currentFeedback = { type: "success", msg: "Pagamento confirmado. O teu pedido foi actualizado." };
    } else if (outcome === "failed") {
      events.push("PAYMENT_SYNC_FAILED");
      currentFeedback = { type: "error", msg: "Este pagamento não foi concluído. Podes tentar novamente." };
    } else {
      events.push("PAYMENT_SYNC_PENDING");
      currentFeedback = {
        type: "error",
        msg: "Pagamento ainda em confirmação.",
      };
    }

    return { events, returnPhase: currentReturnPhase, feedback: currentFeedback };
  }

  it("completed status → phase=confirmed, order updated, feedback success", async () => {
    const { events, returnPhase, feedback } = await simulateSync("completed");
    assert.ok(events.includes("PAYMENT_SYNC_CONFIRMED"));
    assert.equal(returnPhase, "confirmed", "must transition to confirmed phase");
    assert.equal(feedback.type, "success");
  });

  it("success status → confirmed (completed redirects to /orders)", async () => {
    const { returnPhase } = await simulateSync("SUCCESS");
    assert.equal(returnPhase, "confirmed", "SUCCESS must confirm payment and trigger redirect");
  });

  it("pending status → phase stays idle, feedback warns not to pay again", async () => {
    const { events, returnPhase, feedback } = await simulateSync("pending");
    assert.ok(events.includes("PAYMENT_SYNC_PENDING"));
    assert.equal(returnPhase, "idle", "pending must not change phase");
    assert.equal(feedback.type, "error");
    assert.ok(feedback.msg.includes("ainda em confirmação"));
  });

  it("failed status → logs PAYMENT_SYNC_FAILED, allows retry", async () => {
    const { events, feedback } = await simulateSync("failed");
    assert.ok(events.includes("PAYMENT_SYNC_FAILED"));
    assert.equal(feedback.type, "error");
    assert.ok(feedback.msg.includes("tentar novamente"), "must offer retry for failed payment");
  });

  it("completed sync confirms order — payment SUCCESS never stays PENDING_PAYMENT", async () => {
    const gatewayStatus = "completed";
    const outcome = classifySyncResult(gatewayStatus);
    assert.equal(outcome, "confirmed");
    // After confirmed, the page transitions to "confirmed" phase and polls loadOrder()
    // which picks up the new order status. This invariant ensures no SUCCESS + PENDING_PAYMENT.
    const { returnPhase } = await simulateSync(gatewayStatus);
    assert.equal(returnPhase, "confirmed", "confirmed sync must exit PENDING_PAYMENT state");
  });
});

// ── Test 4: functional updater — stale closure cannot override "confirmed" ────
// Mirrors: setReturnPhase(prev => prev === "confirming" ? "timed_out" : prev)
// The auto-sync useEffect captures performSync at mount (empty deps).
// If the order is already confirmed via polling before the 2 s auto-sync fires,
// a stale closure reading returnPhase="confirming" must NOT override "confirmed".

describe("phase transition safety — functional updater prevents stale-closure race (test 4)", () => {
  function applyFailedOutcome(currentPhase) {
    return currentPhase === "confirming" ? "timed_out" : currentPhase;
  }

  it("failed sync outcome with real phase=confirmed → phase stays confirmed", () => {
    // Real phase is "confirmed"; stale closure would pass "confirming" as prev.
    // The functional updater receives the REAL prev, not the stale closure value.
    assert.equal(applyFailedOutcome("confirmed"), "confirmed",
      "failed sync must not override confirmed phase");
  });

  it("failed sync outcome with phase=confirming → transitions to timed_out", () => {
    assert.equal(applyFailedOutcome("confirming"), "timed_out");
  });

  it("failed sync outcome with phase=timed_out → stays timed_out", () => {
    assert.equal(applyFailedOutcome("timed_out"), "timed_out");
  });

  it("failed sync outcome with phase=idle (manual sync) → stays idle", () => {
    assert.equal(applyFailedOutcome("idle"), "idle");
  });
});

// ── Test 5: PAYMENT_RETURN_CONFIRMED fires exactly once per mount ─────────────
// Mirrors: if (!confirmedLoggedRef.current) { confirmedLoggedRef.current = true; log() }

describe("PAYMENT_RETURN_CONFIRMED guard — fires once per mount (test 5)", () => {
  function makeConfirmedLogger() {
    let logged = false;
    let count = 0;
    return {
      maybeLog() {
        if (!logged) { logged = true; count++; }
      },
      get count() { return count; },
    };
  }

  it("fires once even when loadOrder is called 4× on a PAID order", () => {
    const logger = makeConfirmedLogger();
    logger.maybeLog(); // initial loadOrder
    logger.maybeLog(); // polling tick 1 (3 s)
    logger.maybeLog(); // polling tick 2
    logger.maybeLog(); // performSync → await loadOrder()
    assert.equal(logger.count, 1, "PAYMENT_RETURN_CONFIRMED must fire exactly once per mount");
  });

  it("a fresh mount (new component instance) can log again", () => {
    const logger1 = makeConfirmedLogger();
    logger1.maybeLog();
    assert.equal(logger1.count, 1);

    // New mount = new ref
    const logger2 = makeConfirmedLogger();
    logger2.maybeLog();
    assert.equal(logger2.count, 1, "second mount must also log once");
  });
});

// ── Tests 6 & 7: source-code inspection — log placement ──────────────────────
// These verify the countdown ticker contains PAYMENT_RETURN_TIMEOUT (and only that),
// and that PAYMENT_SYNC_TIMEOUT is NOT present in the ticker (removed as duplicate).

describe("log placement — PAYMENT_RETURN_TIMEOUT alone in ticker (tests 6 & 7)", () => {
  let source = "";

  before(async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const pageUrl = new URL(
      "../app/(client)/orders/[id]/payment/page.tsx",
      import.meta.url,
    );
    source = readFileSync(fileURLToPath(pageUrl), "utf8");
  });

  it("countdown ticker contains PAYMENT_RETURN_TIMEOUT (test 6)", () => {
    // Isolate the countdown ticker effect block.
    const block = source.match(
      /Confirming window: countdown ticker[\s\S]*?clearInterval\(interval\);\s*\}/,
    )?.[0] ?? "";
    assert.ok(block.length > 0, "countdown block must be found in source");
    assert.ok(
      block.includes("PAYMENT_RETURN_TIMEOUT"),
      "ticker must log PAYMENT_RETURN_TIMEOUT on 90 s expiry",
    );
  });

  it("countdown ticker does NOT contain PAYMENT_SYNC_TIMEOUT (test 6)", () => {
    const block = source.match(
      /Confirming window: countdown ticker[\s\S]*?clearInterval\(interval\);\s*\}/,
    )?.[0] ?? "";
    assert.ok(
      !block.includes("PAYMENT_SYNC_TIMEOUT"),
      "PAYMENT_SYNC_TIMEOUT must not be in the countdown ticker — it was removed as a duplicate",
    );
  });

  it("PAYMENT_SYNC_TIMEOUT is not emitted anywhere in the countdown phase (test 7)", () => {
    // The confirming-window code (ticker + auto-sync useEffect) must not contain
    // PAYMENT_SYNC_TIMEOUT — that log belongs only to an actual sync network timeout.
    // Extract from the "Confirming window" comment to the end of the auto-sync effect.
    const confirmingSection = source.match(
      /Confirming window: countdown ticker[\s\S]*?\/\/ Auto-redirect countdown after confirmed phase\./,
    )?.[0] ?? "";
    assert.ok(confirmingSection.length > 0, "confirming section must be found");
    assert.ok(
      !confirmingSection.includes("PAYMENT_SYNC_TIMEOUT"),
      "PAYMENT_SYNC_TIMEOUT must not appear in the confirming-window section",
    );
  });
});
