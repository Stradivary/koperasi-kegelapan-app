/**
 * Additional coverage for reconcileCore.ts
 * Targets: lines 39-43 (hexToBytes), 85-167 (processEvent, processReconciliation)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processReconciliation,
  type ReconcileEvent,
  type ReconcileRequest,
} from "../reconcileCore";

// ── DB mock ───────────────────────────────────────────────────────────────────

const mockDbGet = vi.fn();
const mockDbRun = vi.fn();

const mockDb = {
  get: (...a: unknown[]) => mockDbGet(...a),
  run: (...a: unknown[]) => mockDbRun(...a),
} as never;

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
    tenantId: "tenant-1",
    ...overrides,
  };
}

function makeRequest(events: ReconcileEvent[], terminalId = 1): ReconcileRequest {
  return { terminalId, events };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbGet.mockResolvedValue(null); // no duplicate by default
  mockDbRun.mockResolvedValue(undefined);
});

// ── processReconciliation - empty/invalid input ───────────────────────────────

describe("processReconciliation - empty/invalid input", () => {
  it("returns zero counts for empty events array", async () => {
    const result = await processReconciliation(mockDb, makeRequest([]));
    expect(result).toEqual({ accepted: 0, rejected: 0, flags: [] });
  });

  it("returns zero counts when events is not an array", async () => {
    const result = await processReconciliation(mockDb, { terminalId: 1, events: null as never });
    expect(result).toEqual({ accepted: 0, rejected: 0, flags: [] });
  });
});

// ── processReconciliation - valid events ──────────────────────────────────────

describe("processReconciliation - valid events", () => {
  it("accepts a valid event and inserts into audit_log", async () => {
    const result = await processReconciliation(mockDb, makeRequest([makeEvent()]));
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.flags).toHaveLength(0);
    expect(mockDbRun).toHaveBeenCalledTimes(2); // INSERT + UPDATE
  });

  it("accepts multiple valid events", async () => {
    const events = [
      makeEvent({ counter: 1 }),
      makeEvent({ counter: 2, idempotencyKey: "tenant-1:aabbccdd:2" }),
    ];
    const result = await processReconciliation(mockDb, makeRequest(events));
    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(0);
  });

  it("updates card balance after accepting event", async () => {
    await processReconciliation(mockDb, makeRequest([makeEvent()]));
    // Second db.run call is the UPDATE cards statement
    expect(mockDbRun).toHaveBeenCalledTimes(2);
  });
});

// ── processReconciliation - rejections ───────────────────────────────────────

describe("processReconciliation - rejections", () => {
  it("rejects malformed event (missing cardId)", async () => {
    const result = await processReconciliation(mockDb, makeRequest([makeEvent({ cardId: "" })]));
    expect(result.rejected).toBe(1);
    expect(result.flags[0].reason).toBe("malformed_event");
  });

  it("rejects event with missing tenantId and unparseable idempotencyKey", async () => {
    const result = await processReconciliation(
      mockDb,
      makeRequest([makeEvent({ tenantId: undefined, idempotencyKey: "bad" })]),
    );
    expect(result.rejected).toBe(1);
    expect(result.flags[0].reason).toBe("missing_tenant_id");
  });

  it("rejects duplicate event (same counter already in audit_log)", async () => {
    mockDbGet.mockResolvedValue({ id: 99 }); // duplicate found
    const result = await processReconciliation(mockDb, makeRequest([makeEvent()]));
    expect(result.rejected).toBe(1);
    expect(result.flags[0].reason).toBe("duplicate_counter");
    expect(mockDbRun).not.toHaveBeenCalled(); // no INSERT
  });

  it("flags duplicate_counter when db.run throws UNIQUE constraint error", async () => {
    mockDbGet.mockResolvedValue(null);
    mockDbRun.mockRejectedValueOnce(new Error("UNIQUE constraint failed: audit_log.card_id"));
    const result = await processReconciliation(mockDb, makeRequest([makeEvent()]));
    expect(result.rejected).toBe(1);
    expect(result.flags[0].reason).toBe("duplicate_counter");
  });

  it("flags internal_error when db.run throws non-UNIQUE error", async () => {
    mockDbGet.mockResolvedValue(null);
    mockDbRun.mockRejectedValueOnce(new Error("Database connection lost"));
    const result = await processReconciliation(mockDb, makeRequest([makeEvent()]));
    expect(result.rejected).toBe(1);
    expect(result.flags[0].reason).toBe("internal_error");
  });

  it("flags internal_error when db.get throws", async () => {
    mockDbGet.mockRejectedValueOnce(new Error("IDB read error"));
    const result = await processReconciliation(mockDb, makeRequest([makeEvent()]));
    expect(result.rejected).toBe(1);
    expect(result.flags[0].reason).toBe("internal_error");
  });
});

// ── processReconciliation - mixed batch ───────────────────────────────────────

describe("processReconciliation - mixed batch", () => {
  it("processes mix of valid and invalid events correctly", async () => {
    const events = [
      makeEvent({ counter: 1 }),
      makeEvent({ cardId: "", counter: 2 }), // malformed
      makeEvent({ counter: 3, idempotencyKey: "tenant-1:aabbccdd:3" }),
    ];
    const result = await processReconciliation(mockDb, makeRequest(events));
    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].reason).toBe("malformed_event");
  });

  it("includes cardId and counter in flags", async () => {
    const result = await processReconciliation(mockDb, makeRequest([makeEvent({ cardId: "" })]));
    expect(result.flags[0].cardId).toBe("");
    expect(result.flags[0].counter).toBe(1);
  });

  it("uses 'unknown' for cardId in flags when event has no cardId", async () => {
    mockDbGet.mockRejectedValueOnce(new Error("fail"));
    const event = makeEvent({ cardId: undefined as unknown as string });
    const result = await processReconciliation(mockDb, makeRequest([event]));
    expect(result.flags[0].cardId).toBe("unknown");
  });
});
