import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { cardsRoutes } from "../../routes/cards";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

function createMockD1(rawRows: unknown[][] = []) {
  return {
    prepare: () => ({
      bind: (..._args: unknown[]) => ({
        raw: async () => rawRows,
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: {} }),
      }),
      raw: async () => rawRows,
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true, meta: {} }),
    }),
    exec: async () => ({ count: 0, duration: 0 }),
    batch: async (stmts: unknown[]) =>
      (stmts as unknown[]).map(() => ({
        results: rawRows,
        success: true,
        meta: { changes: 1 },
      })),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    c.env = { DB: db, SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.route("/api/cards", cardsRoutes);
  return app;
}

function buildTestToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${header}.${body}.unsigned`;
}

describe("GET /api/cards/check-uid", () => {
  it("returns 400 when uid parameter is missing", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/check-uid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("uid query parameter is required");
  });

  it("returns 400 for UID shorter than 8 hex chars", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/check-uid?uid=abcdef");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid UID format");
  });

  it("returns { exists: false } when UID is not found", async () => {
    const app = createApp(createMockD1([]));
    const res = await app.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });

  it("returns { exists: true, tenantId } when UID is found", async () => {
    const app = createApp(createMockD1([["tenant-123"]]));
    const res = await app.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: true, tenantId: "tenant-123" });
  });
});

describe("POST /api/cards/:cardId/block", () => {
  const validToken = buildTestToken({
    accountId: "acc-1",
    tenantId: "tenant-1",
    role: "admin",
    deviceId: "device-1",
  });

  it("returns 401 when no auth token is provided", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "blocked_admin", changedBy: "admin1" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: "invalid json{",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Request body is required");
  });

  it("returns 400 when reason is missing", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ changedBy: "admin1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("reason is required");
  });

  it("returns 400 when changedBy is missing", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ reason: "blocked_admin" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("changedBy is required");
  });

  it("returns 400 for invalid block reason", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ reason: "invalid_reason", changedBy: "admin1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid reason");
  });

  it("returns 404 when card does not exist", async () => {
    const app = createApp(createMockD1([]));
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ reason: "blocked_admin", changedBy: "admin1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Card not found");
  });

  it("returns success when card exists and block is valid", async () => {
    const app = createApp(createMockD1([["tenant-1", "active"]]));
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ reason: "blocked_admin", changedBy: "admin1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cardId).toBe("04a2b3c4d5e6f7");
    expect(body.status).toBe("blocked_admin");
    expect(body.changedBy).toBe("admin1");
    expect(body.timestamp).toBeTypeOf("number");
  });

  it("accepts all valid block reasons", async () => {
    const reasons = ["blocked_admin", "blocked_tamper", "blocked_fraud", "blocked_expired"];
    for (const reason of reasons) {
      const app = createApp(createMockD1([["tenant-1", "active"]]));
      const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ reason, changedBy: "admin1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe(reason);
    }
  });
});
