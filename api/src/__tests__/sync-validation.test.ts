/**
 * Tests for api/src/routes/sync.ts — validateTransaction and push endpoint
 * Covers: validation rules, type checking, range checking, batch limits
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { syncRoutes } from "../routes/sync";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

function createToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function createMockD1(): D1Database {
  const mockStatement: D1PreparedStatement = {
    bind: (..._args: unknown[]) => mockStatement,
    first: async () => null,
    all: async () => ({ results: [], success: true, meta: {} }) as unknown as D1Result<unknown>,
    run: async () => ({ results: [], success: true, meta: {} }) as unknown as D1Result<unknown>,
    raw: async () => [],
  } as unknown as D1PreparedStatement;
  return {
    prepare: () => mockStatement,
    dump: async () => new ArrayBuffer(0),
    batch: async (stmts: unknown[]) =>
      (stmts as unknown[]).map(() => ({ results: [], success: true, meta: {} })),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

const ENV = { DB: createMockD1(), SESSION_MASTER_KEY: "test-key" };
const TOKEN = createToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
const AUTH = `Bearer ${TOKEN}`;

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/sync", syncRoutes);
  return app;
}

function makeValidTx(overrides: Record<string, unknown> = {}) {
  return {
    cardId: "aabbccdd",
    counter: 5,
    type: "debit",
    amount: 10000,
    balanceAfter: 40000,
    timestamp: 1700000000,
    hash: "deadbeef",
    idempotencyKey: "t1:aabbccdd:5",
    ...overrides,
  };
}

async function push(app: ReturnType<typeof createApp>, transactions: unknown[], token = AUTH) {
  return app.request(
    "/api/sync/push",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ tenantId: "t1", transactions }),
    },
    ENV,
  );
}

describe("POST /api/sync/push — transaction validation", () => {
  const app = createApp();

  it("rejects transaction with missing cardId", async () => {
    const res = await push(app, [makeValidTx({ cardId: "" })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("malformed_event");
  });

  it("rejects transaction with missing hash", async () => {
    const res = await push(app, [makeValidTx({ hash: "" })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("malformed_event");
  });

  it("rejects transaction with missing idempotencyKey", async () => {
    const res = await push(app, [makeValidTx({ idempotencyKey: "" })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("malformed_event");
  });

  it("rejects transaction with invalid type", async () => {
    const res = await push(app, [makeValidTx({ type: "invalid" })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_type");
  });

  it("rejects transaction with negative amount", async () => {
    const res = await push(app, [makeValidTx({ amount: -1 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_amount");
  });

  it("rejects transaction with amount exceeding 16M", async () => {
    const res = await push(app, [makeValidTx({ amount: 16000001 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_amount");
  });

  it("rejects topup with amount exceeding 2M", async () => {
    const res = await push(app, [makeValidTx({ type: "topup", amount: 2000001 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("topup_amount_exceeds_limit");
  });

  it("accepts topup with amount at 2M exactly", async () => {
    const res = await push(app, [makeValidTx({ type: "topup", amount: 2000000 })]);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  it("rejects transaction with counter exceeding 65535", async () => {
    const res = await push(app, [makeValidTx({ counter: 65536 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_counter");
  });

  it("rejects transaction with negative counter", async () => {
    const res = await push(app, [makeValidTx({ counter: -1 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_counter");
  });

  it("rejects transaction with balanceAfter exceeding 16M", async () => {
    const res = await push(app, [makeValidTx({ balanceAfter: 16000001 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_balance");
  });

  it("rejects transaction with negative balanceAfter", async () => {
    const res = await push(app, [makeValidTx({ balanceAfter: -1 })]);
    const body = await res.json();
    expect(body.rejected[0].reason).toBe("invalid_balance");
  });

  it("accepts all valid transaction types", async () => {
    const types = ["debit", "credit", "checkin", "checkout", "topup", "admin"];
    for (const type of types) {
      const res = await push(app, [makeValidTx({ type, idempotencyKey: `t1:aabb:${type}` })]);
      const body = await res.json();
      expect(body.accepted).toBeGreaterThanOrEqual(1);
    }
  });

  it("accepts counter=0 as valid", async () => {
    const res = await push(app, [makeValidTx({ counter: 0 })]);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  it("accepts amount=0 as valid", async () => {
    const res = await push(app, [makeValidTx({ amount: 0 })]);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  it("returns serverCursor as a numeric string", async () => {
    const res = await push(app, [makeValidTx()]);
    const body = await res.json();
    expect(Number(body.serverCursor)).toBeGreaterThan(0);
  });

  it("handles mixed valid and invalid transactions", async () => {
    const res = await push(app, [
      makeValidTx({ idempotencyKey: "t1:aabb:1" }),
      makeValidTx({ type: "invalid", idempotencyKey: "t1:aabb:2" }),
      makeValidTx({ amount: -1, idempotencyKey: "t1:aabb:3" }),
    ]);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.rejected).toHaveLength(2);
  });
});
