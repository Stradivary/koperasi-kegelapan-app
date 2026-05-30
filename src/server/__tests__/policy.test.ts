// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getDefaultPolicy } from "../policy";

describe("getDefaultPolicy", () => {
  it("returns a policy with the given tenantId", () => {
    const policy = getDefaultPolicy("tenant-abc");
    expect(policy.tenantId).toBe("tenant-abc");
  });

  it("returns default maxTransactionAmount of 1_000_000", () => {
    const policy = getDefaultPolicy("t-1");
    expect(policy.maxTransactionAmount).toBe(1_000_000);
  });

  it("returns default maxDailyTotal of 5_000_000", () => {
    const policy = getDefaultPolicy("t-1");
    expect(policy.maxDailyTotal).toBe(5_000_000);
  });

  it("returns topupOnlineOnly as true", () => {
    const policy = getDefaultPolicy("t-1");
    expect(policy.topupOnlineOnly).toBe(true);
  });

  it("returns allowedTxTypes with debit, credit, checkin, checkout", () => {
    const policy = getDefaultPolicy("t-1");
    expect(policy.allowedTxTypes).toContain("debit");
    expect(policy.allowedTxTypes).toContain("credit");
    expect(policy.allowedTxTypes).toContain("checkin");
    expect(policy.allowedTxTypes).toContain("checkout");
  });

  it("returns sessionTimeoutHours of 24", () => {
    const policy = getDefaultPolicy("t-1");
    expect(policy.sessionTimeoutHours).toBe(24);
  });

  it("returns independent objects for different tenantIds", () => {
    const p1 = getDefaultPolicy("t-1");
    const p2 = getDefaultPolicy("t-2");
    expect(p1.tenantId).toBe("t-1");
    expect(p2.tenantId).toBe("t-2");
    // Each call returns a new object
    expect(p1).not.toBe(p2);
  });
});
