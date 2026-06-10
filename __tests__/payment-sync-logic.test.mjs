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
  if (p.canRetry && !p.financialEvidence) return false;
  const s = (p.status ?? "").toUpperCase();
  return ["PENDING", "PROCESSING", "WAITING"].includes(s) && !!(p.providerReference || p.checkoutUrl);
}

function canGenerateRetry({ orderStatus, isPaid = false, paysuitePayment }) {
  const lastSyncNoFinancialEvidence = !!paysuitePayment
    && paysuitePayment.financialEvidence !== true
    && ["NO_FINANCIAL_EVIDENCE", "SYNC_NO_RESPONSE"].includes(paysuitePayment.syncStatus);
  return orderStatus === "PENDING_PAYMENT"
    && !isPaid
    && !!paysuitePayment?.canRetry
    && lastSyncNoFinancialEvidence;
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

  it("PENDING with retry permission and no financial evidence is not treated as active", () => {
    assert.ok(!isActivePaySuitePayment({
      status: "PENDING",
      providerReference: "REF-NO-EVIDENCE",
      canRetry: true,
      financialEvidence: false,
    }));
  });
});

describe("canGenerateRetry", () => {
  it("allows retry after NO_FINANCIAL_EVIDENCE on pending order", () => {
    assert.ok(canGenerateRetry({
      orderStatus: "PENDING_PAYMENT",
      paysuitePayment: {
        status: "PENDING",
        syncStatus: "NO_FINANCIAL_EVIDENCE",
        financialEvidence: false,
        canRetry: true,
      },
    }));
  });

  it("blocks retry when financial evidence exists", () => {
    assert.ok(!canGenerateRetry({
      orderStatus: "PENDING_PAYMENT",
      paysuitePayment: {
        status: "PENDING",
        syncStatus: "NO_FINANCIAL_EVIDENCE",
        financialEvidence: true,
        canRetry: true,
      },
    }));
  });

  it("blocks retry when order is no longer pending payment", () => {
    assert.ok(!canGenerateRetry({
      orderStatus: "PAID",
      paysuitePayment: {
        status: "PENDING",
        syncStatus: "NO_FINANCIAL_EVIDENCE",
        financialEvidence: false,
        canRetry: true,
      },
    }));
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

// ── State machine initial-state computation ───────────────────────────────

describe("payment form visibility gates (state machine)", () => {
  const TERMINAL_STATUSES = new Set(["FAILED", "CANCELLED", "AMOUNT_MISMATCH", "LATE_PAYMENT"]);

  // Mirrors the initial-load state computation in loadOrder().
  function computeInitialUiState({ orderStatus, paysuitePayment }) {
    const active = isActivePaySuitePayment(paysuitePayment);
    const processing = orderStatus === "PAYMENT_SUBMITTED" || orderStatus === "PAYMENT_UNDER_REVIEW";
    const rejected = orderStatus === "PAYMENT_REJECTED";
    const terminalGateway = TERMINAL_STATUSES.has((paysuitePayment?.status ?? "").toUpperCase());
    if (rejected || terminalGateway) return "failed";
    if (active || processing) return "returned_pending";
    if (orderStatus === "PENDING_PAYMENT") return "ready_to_pay";
    return "returned_pending";
  }

  // Method selector visibility: only in ready_to_pay (when verified) or retry_choose_method.
  function methodSelectorVisible(uiState, verificationOk) {
    return (uiState === "ready_to_pay" && verificationOk) || uiState === "retry_choose_method";
  }

  // Retry path available when payment definitively failed and user is verified.
  function canShowSafeRetry({ uiState, verificationOk, hasActive, canGenerateRetry, explicitFailure, syncFailed }) {
    return verificationOk
      && !hasActive
      && (canGenerateRetry || explicitFailure || syncFailed)
      && (uiState === "returned_pending" || uiState === "failed" || uiState === "retry_warning");
  }

  it("psr=1 — entering checking_payment, method selector not shown", () => {
    // On return from PaySuite, state starts as checking_payment — no method selector.
    assert.ok(!methodSelectorVisible("checking_payment", true), "form must be hidden in checking_payment");
  });

  it("returned_pending without failure — method selector hidden, no retry path", () => {
    assert.ok(!methodSelectorVisible("returned_pending", true), "form must be hidden in returned_pending");
    const retry = canShowSafeRetry({ uiState: "returned_pending", verificationOk: true, hasActive: false, canGenerateRetry: false, explicitFailure: false, syncFailed: false });
    assert.ok(!retry, "must not show retry when payment has no evidence of failure");
  });

  it("returned_pending with PAYMENT_REJECTED — retry path available", () => {
    const retry = canShowSafeRetry({ uiState: "returned_pending", verificationOk: true, hasActive: false, canGenerateRetry: false, explicitFailure: true, syncFailed: false });
    assert.ok(retry, "retry allowed when backend reported explicit failure");
  });

  it("returned_pending with PENDING_PAYMENT (no failure) — no retry path", () => {
    const retry = canShowSafeRetry({ uiState: "returned_pending", verificationOk: true, hasActive: false, canGenerateRetry: false, explicitFailure: false, syncFailed: false });
    assert.ok(!retry, "must not allow retry when no failure evidence");
  });

  it("PENDING_PAYMENT, no active payment → initial state is ready_to_pay", () => {
    const state = computeInitialUiState({ orderStatus: "PENDING_PAYMENT", paysuitePayment: null });
    assert.equal(state, "ready_to_pay");
    assert.ok(methodSelectorVisible(state, true), "method selector must be shown in ready_to_pay");
  });

  it("PENDING_PAYMENT, active PaySuite tx → initial state is returned_pending", () => {
    const state = computeInitialUiState({ orderStatus: "PENDING_PAYMENT", paysuitePayment: { status: "PENDING", providerReference: "REF-1" } });
    assert.equal(state, "returned_pending");
    assert.ok(!methodSelectorVisible(state, true), "method selector must be hidden in returned_pending");
  });

  it("PAYMENT_REJECTED → initial state is failed", () => {
    const state = computeInitialUiState({ orderStatus: "PAYMENT_REJECTED", paysuitePayment: null });
    assert.equal(state, "failed");
  });

  it("terminal gateway status → initial state is failed", () => {
    const state = computeInitialUiState({ orderStatus: "PENDING_PAYMENT", paysuitePayment: { status: "FAILED", providerReference: "REF-1" } });
    assert.equal(state, "failed");
  });
});

// ── Full sync flow simulation (rules 3, 4, 5, 6) ─────────────────────────

describe("full sync flow outcomes", () => {
  async function simulateSync(gatewayStatus) {
    const events = [];
    // State machine: starts in returned_pending for manual syncs, checking_payment for initial.
    let currentUiState = "returned_pending";
    let currentFeedback = null;

    const outcome = classifySyncResult(gatewayStatus);

    if (outcome === "confirmed") {
      events.push("PAYMENT_SYNC_CONFIRMED");
      currentUiState = "confirmed";
      currentFeedback = { type: "success", msg: "Pagamento confirmado. O teu pedido foi actualizado." };
    } else if (outcome === "failed") {
      events.push("PAYMENT_SYNC_FAILED");
      // uiState stays returned_pending (or transitions from checking_payment to returned_pending)
      currentFeedback = { type: "error", msg: "Este pagamento não foi concluído. Podes tentar novamente." };
    } else {
      events.push("PAYMENT_SYNC_PENDING");
      currentFeedback = {
        type: "error",
        msg: "Pagamento ainda em confirmação.",
      };
    }

    return { events, uiState: currentUiState, feedback: currentFeedback };
  }

  it("completed status → uiState=confirmed, order updated, feedback success", async () => {
    const { events, uiState, feedback } = await simulateSync("completed");
    assert.ok(events.includes("PAYMENT_SYNC_CONFIRMED"));
    assert.equal(uiState, "confirmed", "must transition to confirmed state");
    assert.equal(feedback.type, "success");
  });

  it("success status → confirmed (triggers redirect to /orders)", async () => {
    const { uiState } = await simulateSync("SUCCESS");
    assert.equal(uiState, "confirmed", "SUCCESS must confirm payment and trigger redirect");
  });

  it("pending status → uiState stays returned_pending, feedback warns not to pay again", async () => {
    const { events, uiState, feedback } = await simulateSync("pending");
    assert.ok(events.includes("PAYMENT_SYNC_PENDING"));
    assert.equal(uiState, "returned_pending", "pending must not change to confirmed");
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
    // After confirmed, the page transitions to "confirmed" state and polls loadOrder()
    // which picks up the new order status. This invariant ensures no SUCCESS + PENDING_PAYMENT.
    const { uiState } = await simulateSync(gatewayStatus);
    assert.equal(uiState, "confirmed", "confirmed sync must exit PENDING_PAYMENT state");
  });
});

// ── Test 4: functional updater — stale closure cannot override "confirmed" ────
// Mirrors: setUiState(prev => prev === "confirmed" ? "confirmed" : "returned_pending")
// The auto-sync useEffect captures performSync at mount (empty deps).
// If the order is already confirmed via polling before the 2 s auto-sync fires,
// the functional updater receives the REAL prev ("confirmed"), not the stale closure value
// ("checking_payment"), so it never overrides the confirmed state.

describe("phase transition safety — functional updater prevents stale-closure race (test 4)", () => {
  // Mirrors performSync initial-outcome handling:
  //   setUiState(prev => prev === "confirmed" ? "confirmed" : "returned_pending")
  function applyInitialSyncOutcome(currentState) {
    return currentState === "confirmed" ? "confirmed" : "returned_pending";
  }

  it("failed/pending sync outcome with real state=confirmed → state stays confirmed", () => {
    // Real state is "confirmed"; stale closure would assume "checking_payment".
    // The functional updater receives the REAL prev, not the stale closure value.
    assert.equal(applyInitialSyncOutcome("confirmed"), "confirmed",
      "failed sync must not override confirmed state");
  });

  it("failed/pending sync outcome with state=checking_payment → transitions to returned_pending", () => {
    assert.equal(applyInitialSyncOutcome("checking_payment"), "returned_pending");
  });

  it("failed/pending sync outcome with state=returned_pending → stays returned_pending", () => {
    assert.equal(applyInitialSyncOutcome("returned_pending"), "returned_pending");
  });

  it("failed/pending sync outcome with state=loading_order (edge case) → returned_pending", () => {
    assert.equal(applyInitialSyncOutcome("loading_order"), "returned_pending");
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
// These verify PAYMENT_RETURN_TIMEOUT is logged when the 90 s fast-poll window expires,
// and that PAYMENT_SYNC_TIMEOUT does not appear in the return-window section.

describe("log placement — PAYMENT_RETURN_TIMEOUT in return-window effect (tests 6 & 7)", () => {
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

  it("return-window effect contains PAYMENT_RETURN_TIMEOUT (test 6)", () => {
    // Isolate the return-window fast-poll timeout effect block.
    const block = source.match(
      /Return window: fast-poll timeout[\s\S]*?clearTimeout\(timer\);\s*\}/,
    )?.[0] ?? "";
    assert.ok(block.length > 0, "return-window block must be found in source");
    assert.ok(
      block.includes("PAYMENT_RETURN_TIMEOUT"),
      "return-window effect must log PAYMENT_RETURN_TIMEOUT on 90 s expiry",
    );
  });

  it("return-window effect does NOT contain PAYMENT_SYNC_TIMEOUT (test 6)", () => {
    const block = source.match(
      /Return window: fast-poll timeout[\s\S]*?clearTimeout\(timer\);\s*\}/,
    )?.[0] ?? "";
    assert.ok(
      !block.includes("PAYMENT_SYNC_TIMEOUT"),
      "PAYMENT_SYNC_TIMEOUT must not be in the return-window effect",
    );
  });

  it("PAYMENT_SYNC_TIMEOUT is not emitted in the return-window or auto-sync section (test 7)", () => {
    // Extract from the return-window comment to the end of the auto-sync effect.
    const returnSection = source.match(
      /Return window: fast-poll timeout[\s\S]*?\/\/ Auto-redirect countdown after confirmed state\./,
    )?.[0] ?? "";
    assert.ok(returnSection.length > 0, "return-window section must be found");
    assert.ok(
      !returnSection.includes("PAYMENT_SYNC_TIMEOUT"),
      "PAYMENT_SYNC_TIMEOUT must not appear in the return-window section",
    );
  });
});
