// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { extractTenantId, validateReconcileEvent, type ReconcileEvent } from "../reconcileCore";

function makeEvent(overrides: Partial<ReconcileEvent> = {}): ReconcileEvent {
  return {
    cardId: "aabbccdd",
    counter: 1,
    type: "debit",
    amount: 5000,
    balanceAfter: 45000,
    timestamp: 1700000000,
    hash: "deadbeef",
    idempotencyKey: "tenant-1:aabbccdd:1",
    ...overrides,
  };
}

describe("extractTenantId", () => {
  it("returns tenantId from explicit field when present", () => {
    const event = makeEvent({ tenantId: "my-tenant" });
    expect(extractTenantId(event)).toBe("my-tenant");
  });

  it("parses tenantId from idempotencyKey when tenantId field is absent", () => {
    const event = makeEvent({ idempotencyKey: "tenant-abc:aabbccdd:5" });
    expect(extractTenantId(event)).toBe("tenant-abc");
  });

  it("returns null when idempotencyKey has fewer than 3 parts", () => {
    const event = makeEvent({ idempotencyKey: "onlyone" });
    expect(extractTenantId(event)).toBeNull();
  });

  it("returns null when idempotencyKey has exactly 2 parts", () => {
    const event = makeEvent({ idempotencyKey: "tenant:card" });
    expect(extractTenantId(event)).toBeNull();
  });

  it("returns null when idempotencyKey is empty string", () => {
    const event = makeEvent({ idempotencyKey: "" });
    expect(extractTenantId(event)).toBeNull();
  });

  it("prefers explicit tenantId over idempotencyKey", () => {
    const event = makeEvent({
      tenantId: "explicit-tenant",
      idempotencyKey: "other-tenant:card:1",
    });
    expect(extractTenantId(event)).toBe("explicit-tenant");
  });
});

describe("validateReconcileEvent", () => {
  it("returns valid for a complete event", () => {
    const result = validateReconcileEvent(makeEvent());
    expect(result.valid).toBe(true);
  });

  it("returns invalid when cardId is missing", () => {
    const result = validateReconcileEvent(makeEvent({ cardId: "" }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("malformed_event");
  });

  it("returns invalid when counter is null", () => {
    const result = validateReconcileEvent(makeEvent({ counter: null as unknown as number }));
    expect(result.valid).toBe(false);
  });

  it("returns invalid when type is empty string", () => {
    const result = validateReconcileEvent(makeEvent({ type: "" }));
    expect(result.valid).toBe(false);
  });

  it("returns invalid when amount is null", () => {
    const result = validateReconcileEvent(makeEvent({ amount: null as unknown as number }));
    expect(result.valid).toBe(false);
  });

  it("returns invalid when balanceAfter is null", () => {
    const result = validateReconcileEvent(makeEvent({ balanceAfter: null as unknown as number }));
    expect(result.valid).toBe(false);
  });

  it("returns invalid when timestamp is null", () => {
    const result = validateReconcileEvent(makeEvent({ timestamp: null as unknown as number }));
    expect(result.valid).toBe(false);
  });

  it("returns invalid when hash is empty string", () => {
    const result = validateReconcileEvent(makeEvent({ hash: "" }));
    expect(result.valid).toBe(false);
  });

  it("accepts counter = 0 as valid", () => {
    const result = validateReconcileEvent(makeEvent({ counter: 0 }));
    expect(result.valid).toBe(true);
  });

  it("accepts amount = 0 as valid", () => {
    const result = validateReconcileEvent(makeEvent({ amount: 0 }));
    expect(result.valid).toBe(true);
  });

  it("accepts balanceAfter = 0 as valid", () => {
    const result = validateReconcileEvent(makeEvent({ balanceAfter: 0 }));
    expect(result.valid).toBe(true);
  });
});
