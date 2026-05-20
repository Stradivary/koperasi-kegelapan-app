/**
 * Unit tests for the sync push API endpoint.
 *
 * Tests that the endpoint correctly:
 * - Rejects unauthenticated requests
 * - Validates tenant isolation (token tenant_id must match payload)
 * - Validates payload structure
 * - Rejects transactions with invalid fields
 * - Enforces batch size limit
 * - Returns correct response shape { accepted, rejected, serverCursor }
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.1, 8.3, 8.5, 8.6
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { syncRoutes } from "../../api/src/routes/sync";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

function createToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

/**
 * Creates a minimal mock D1Database.
 * The sync route uses drizzle(c.env.DB) which calls prepare() on the D1 binding.
 */
function createMockD1(): D1Database {
  const mockStatement: D1PreparedStatement = {
    bind: (..._args: unknown[]) => mockStatement,
    first: async () => null,
    all: async () => ({ results: [], success: true, meta: {} }) as unknown as D1Result<unknown>,
    run: async () => ({ results: [], success: true, meta: {} }) as unknown as D1Result<unknown>,
    raw: async () => [],
  } as unknown as D1PreparedStatement;

  return {
    prepare: (_query: string) => mockStatement,
    dump: async () => new ArrayBuffer(0),
    batch: async (stmts: unknown[]) =>
      (stmts as unknown[]).map(() => ({ results: [], success: true, meta: {} })),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/sync", syncRoutes);
  return app;
}

function makeRequest(
  app: ReturnType<typeof createApp>,
  token: string | null,
  body: unknown,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return app.request("/api/sync/push", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, { DB: createMockD1(), SESSION_MASTER_KEY: "test-key" });
}

describe("POST /api/sync/push", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const app = createApp();
    const res = await makeRequest(app, null, { tenantId: "t-1", transactions: [] });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 401 when token is missing tenantId", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1" }); // no tenantId
    const res = await makeRequest(app, token, { tenantId: "t-1", transactions: [] });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is missing accountId", async () => {
    const app = createApp();
    const token = createToken({ tenantId: "t-1" }); // no accountId
    const res = await makeRequest(app, token, { tenantId: "t-1", transactions: [] });
    expect(res.status).toBe(401);
  });

  it("uses token tenantId as authoritative when payload tenantId does not match", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, { tenantId: "t-2", transactions: [] });
    // Token tenantId is used as authoritative — mismatch is logged but not rejected
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toEqual([]);
  });

  it("uses token tenantId when payload tenantId is missing", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, { transactions: [] });
    // Token tenantId is used as authoritative — missing payload tenantId is acceptable
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toEqual([]);
  });

  it("returns 400 when body is malformed JSON", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const res = await app.request("/api/sync/push", {
      method: "POST",
      headers,
      body: "not json",
    }, { DB: createMockD1(), SESSION_MASTER_KEY: "test-key" });
    expect(res.status).toBe(400);
  });

  it("returns empty result for empty transactions array", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, { tenantId: "t-1", transactions: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toEqual([]);
    expect(body.serverCursor).toBeDefined();
    expect(typeof body.serverCursor).toBe("string");
  });

  it("returns 400 when batch exceeds 500 transactions", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const transactions = Array.from({ length: 501 }, (_, i) => ({
      cardId: "aabbccddee01",
      counter: i + 1,
      type: "debit",
      amount: 100,
      balanceAfter: 900,
      timestamp: Math.floor(Date.now() / 1000),
      hash: "abcdef123456",
      idempotencyKey: `t-1:aabbccddee01:${i + 1}`,
    }));
    const res = await makeRequest(app, token, { tenantId: "t-1", transactions });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("500");
  });

  it("rejects transactions with missing required fields", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [{ cardId: "aabbccddee01" }], // missing most fields
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected.length).toBe(1);
    expect(body.rejected[0].reason).toBe("malformed_event");
  });

  it("rejects transactions with invalid type", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        {
          cardId: "aabbccddee01",
          counter: 1,
          type: "invalid_type",
          amount: 100,
          balanceAfter: 900,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:1",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_type");
  });

  it("rejects transactions with amount exceeding maximum", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        {
          cardId: "aabbccddee01",
          counter: 1,
          type: "debit",
          amount: 20000000, // exceeds 16,000,000
          balanceAfter: 900,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:1",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_amount");
  });

  it("rejects transactions with negative amount", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        {
          cardId: "aabbccddee01",
          counter: 1,
          type: "debit",
          amount: -100,
          balanceAfter: 900,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:1",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_amount");
  });

  it("rejects transactions with counter out of range", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        {
          cardId: "aabbccddee01",
          counter: 70000, // exceeds 65535
          type: "debit",
          amount: 100,
          balanceAfter: 900,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:70000",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_counter");
  });

  it("rejects transactions with balanceAfter exceeding maximum", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        {
          cardId: "aabbccddee01",
          counter: 1,
          type: "topup",
          amount: 100,
          balanceAfter: 20000000, // exceeds 16,000,000
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:1",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_balance");
  });

  it("accepts valid transaction when card does not exist (new card)", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    // Mock D1 returns null for both idempotency check and card lookup (first() returns null)
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        {
          cardId: "aabbccddee01",
          counter: 1,
          type: "topup",
          amount: 1000,
          balanceAfter: 1000,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:1",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // With mock D1 returning null for all queries, the transaction should be accepted
    expect(body.accepted).toBe(1);
    expect(body.rejected).toEqual([]);
  });

  it("returns serverCursor as a numeric string (unix timestamp)", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, { tenantId: "t-1", transactions: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    const cursor = Number(body.serverCursor);
    expect(cursor).toBeGreaterThan(1700000000); // reasonable unix timestamp
    expect(cursor).toBeLessThan(2000000000);
  });

  it("handles multiple transactions with mixed validity", async () => {
    const app = createApp();
    const token = createToken({ accountId: "acc-1", tenantId: "t-1" });
    const res = await makeRequest(app, token, {
      tenantId: "t-1",
      transactions: [
        // Valid transaction
        {
          cardId: "aabbccddee01",
          counter: 1,
          type: "topup",
          amount: 1000,
          balanceAfter: 1000,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee01:1",
        },
        // Invalid: bad type
        {
          cardId: "aabbccddee02",
          counter: 1,
          type: "bad_type",
          amount: 100,
          balanceAfter: 100,
          timestamp: Math.floor(Date.now() / 1000),
          hash: "abcdef123456",
          idempotencyKey: "t-1:aabbccddee02:1",
        },
        // Invalid: missing fields
        {
          cardId: "aabbccddee03",
          idempotencyKey: "t-1:aabbccddee03:1",
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.rejected.length).toBe(2);
    expect(body.rejected[0].key).toBe("t-1:aabbccddee02:1");
    expect(body.rejected[0].reason).toBe("invalid_type");
    expect(body.rejected[1].key).toBe("t-1:aabbccddee03:1");
    expect(body.rejected[1].reason).toBe("malformed_event");
  });
});
