import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { pushEntitiesRoute } from "../push-entities";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

function createMockD1(options?: {
  selectResult?: unknown;
  runResult?: unknown;
  throwOnInsert?: string;
}) {
  const mockRun = options?.throwOnInsert
    ? vi.fn().mockRejectedValue(new Error(options.throwOnInsert))
    : vi.fn().mockResolvedValue({ success: true });

  return {
    prepare: () => ({
      bind: (..._args: unknown[]) => ({
        raw: async () => [],
        first: async () => options?.selectResult ?? null,
        all: async () => ({ results: options?.selectResult ? [options.selectResult] : [] }),
        run: mockRun,
      }),
      raw: async () => [],
      first: async () => options?.selectResult ?? null,
      all: async () => ({ results: [] }),
      run: mockRun,
    }),
    exec: async () => ({ count: 0, duration: 0 }),
    batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

function createApp(db?: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    c.env = { DB: db ?? createMockD1(), SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.route("/api/sync", pushEntitiesRoute);
  return app;
}

describe("POST /push-entities", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("returns 401 without auth token", async () => {
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({ tenantId: "t1", members: [], cards: [] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 with malformed body", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: "not json",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_payload");
  });

  it("returns success with empty arrays", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({ tenantId: "t1", members: [], cards: [] }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membersAccepted).toBe(0);
    expect(body.membersRejected).toEqual([]);
    expect(body.cardsAccepted).toBe(0);
    expect(body.cardsRejected).toEqual([]);
  });

  it("returns 400 when members batch exceeds 200", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const members = Array.from({ length: 201 }, (_, i) => ({
      userId: `u${i}`,
      name: `User ${i}`,
      status: "active",
      createdAt: 1000,
      updatedAt: 1000,
    }));
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({ tenantId: "t1", members, cards: [] }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("200");
  });

  it("returns 400 when cards batch exceeds 200", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const cards = Array.from({ length: 201 }, (_, i) => ({
      cardId: `0${i.toString(16).padStart(7, "0")}`,
      userId: null,
      status: "active",
      balance: 0,
      counter: 0,
      keyVersion: 1,
      createdAt: 1000,
      lastActivityAt: null,
      expiresAt: null,
      notes: null,
    }));
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({ tenantId: "t1", members: [], cards }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("200");
  });

  it("rejects members with missing required fields", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "t1",
        members: [{ userId: "", name: "", status: "active", createdAt: 1000, updatedAt: 1000 }],
        cards: [],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membersRejected.length).toBe(1);
    expect(body.membersRejected[0].reason).toBe("malformed_entry");
  });

  it("rejects members with invalid status", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "t1",
        members: [
          {
            userId: "u1",
            name: "User",
            status: "invalid_status",
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        cards: [],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membersRejected.length).toBe(1);
    expect(body.membersRejected[0].reason).toBe("invalid_status");
  });

  it("rejects cards with missing cardId", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "t1",
        members: [],
        cards: [
          {
            cardId: "",
            userId: null,
            status: "active",
            balance: 0,
            counter: 0,
            keyVersion: 1,
            createdAt: 1000,
            lastActivityAt: null,
            expiresAt: null,
            notes: null,
          },
        ],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cardsRejected.length).toBe(1);
    expect(body.cardsRejected[0].reason).toBe("malformed_entry");
  });

  it("rejects cards with invalid status", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "t1",
        members: [],
        cards: [
          {
            cardId: "04a2b3c4d5e6f7",
            userId: null,
            status: "bad_status",
            balance: 0,
            counter: 0,
            keyVersion: 1,
            createdAt: 1000,
            lastActivityAt: null,
            expiresAt: null,
            notes: null,
          },
        ],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cardsRejected.length).toBe(1);
    expect(body.cardsRejected[0].reason).toBe("invalid_status");
  });

  it("handles missing members and cards arrays gracefully", async () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({ tenantId: "t1" }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membersAccepted).toBe(0);
    expect(body.cardsAccepted).toBe(0);
  });

  it("uses token tenantId as authoritative", async () => {
    const token = makeToken({ tenantId: "real-tenant", accountId: "a1", deviceId: "d1" });
    const res = await app.request("/api/sync/push-entities", {
      method: "POST",
      body: JSON.stringify({ tenantId: "fake-tenant", members: [], cards: [] }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(res.status).toBe(200);
  });
});
