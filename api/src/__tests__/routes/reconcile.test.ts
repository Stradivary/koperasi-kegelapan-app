// @vitest-environment node
/**
 * Tests for api/src/routes/reconcile.ts
 * Tests the Hono reconcile route handler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcessReconciliation = vi.fn();
const mockDrizzle = vi.fn().mockReturnValue({ fake: "db" });

vi.mock("drizzle-orm/d1", () => ({
  drizzle: (...args: unknown[]) => mockDrizzle(...args),
}));

vi.mock("#/server/reconcileCore", () => ({
  processReconciliation: (...args: unknown[]) => mockProcessReconciliation(...args),
}));

import { reconcileRoute } from "../../routes/reconcile";

const env = { DB: { fake: "d1" }, SESSION_MASTER_KEY: "test-key" };

function postRequest(body: unknown, options?: { invalidJson?: boolean }) {
  if (options?.invalidJson) {
    return reconcileRoute.request(
      new Request("http://localhost/", {
        method: "POST",
        body: "not json{{{",
        headers: { "Content-Type": "application/json" },
      }),
      undefined,
      env,
    );
  }

  return reconcileRoute.request(
    new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    undefined,
    env,
  );
}

describe("POST /api/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await postRequest(null, { invalidJson: true });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("malformed_payload");
  });

  it("returns 400 when terminalId is missing", async () => {
    const res = await postRequest({ events: [] });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("malformed_payload");
  });

  it("returns 400 when events is not an array", async () => {
    const res = await postRequest({ terminalId: 1, events: "not-array" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("malformed_payload");
  });

  it("returns reconciliation result on success", async () => {
    const expectedResult = { accepted: 2, rejected: 0, flags: [] };
    mockProcessReconciliation.mockResolvedValue(expectedResult);

    const res = await postRequest({
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
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(expectedResult);
    expect(mockProcessReconciliation).toHaveBeenCalled();
  });

  it("returns 500 on internal error", async () => {
    mockProcessReconciliation.mockRejectedValue(new Error("DB connection failed"));

    const res = await postRequest({
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
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("DB connection failed");
  });

  it("passes terminalId and events to processReconciliation", async () => {
    mockProcessReconciliation.mockResolvedValue({ accepted: 1, rejected: 0, flags: [] });

    const events = [
      {
        cardId: "aabbcc",
        counter: 5,
        type: "topup",
        amount: 10000,
        balanceAfter: 60000,
        timestamp: 1700001000,
        hash: "cafebabe",
        idempotencyKey: "t-1:aabbcc:5",
      },
    ];

    await postRequest({ terminalId: 42, events });

    expect(mockProcessReconciliation).toHaveBeenCalledWith(expect.anything(), {
      terminalId: 42,
      events,
    });
  });
});
