// @vitest-environment jsdom
/**
 * Tests for src/server/reconcile.ts
 * Tests the processReconciliation wrapper function.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();
const mockProcessReconciliation = vi.fn();

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: () => mockGetDb(),
}));

vi.mock("#/application/sync/reconcile.usecase", () => ({
  processReconciliation: (...args: unknown[]) => mockProcessReconciliation(...args),
}));

import { processReconciliation } from "#/application/sync/reconcileHandler";

describe("processReconciliation (wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ fake: "db" });
  });

  it("calls reconcileCore.processReconciliation with db and body", async () => {
    const body = {
      terminalId: 1,
      events: [
        {
          cardId: "abc123",
          counter: 1,
          type: "debit",
          amount: 5000,
          balanceAfter: 45000,
          timestamp: 1700000000,
          hash: "deadbeef",
          idempotencyKey: "t-1:abc123:1",
        },
      ],
    };

    const expectedResult = { accepted: 1, rejected: 0, flags: [] };
    mockProcessReconciliation.mockResolvedValue(expectedResult);

    const result = await processReconciliation(body);

    expect(mockProcessReconciliation).toHaveBeenCalledWith({ fake: "db" }, body);
    expect(result).toEqual(expectedResult);
  });

  it("passes through errors from reconcileCore", async () => {
    mockProcessReconciliation.mockRejectedValue(new Error("DB error"));

    await expect(processReconciliation({ terminalId: 1, events: [] })).rejects.toThrow("DB error");
  });

  it("handles empty events array", async () => {
    mockProcessReconciliation.mockResolvedValue({ accepted: 0, rejected: 0, flags: [] });

    const result = await processReconciliation({ terminalId: 1, events: [] });

    expect(result).toEqual({ accepted: 0, rejected: 0, flags: [] });
  });
});
