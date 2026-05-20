import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { cardsRoutes } from "../cards";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

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
    batch: async () => [],
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

describe("GET /api/cards/check-uid", () => {
  it("returns 400 when uid is missing", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/check-uid");
    expect(res.status).toBe(400);
  });

  it("returns 400 for short UID", async () => {
    const app = createApp(createMockD1());
    const res = await app.request("/api/cards/check-uid?uid=abcdef");
    expect(res.status).toBe(400);
  });

  it("returns 400 for long UID", async () => {
    const app = createApp(createMockD1());
    const r = await app.request("/api/cards/check-uid?uid=0123456789abcdef");
    expect(r.status).toBe(400);
  });

  it("returns 400 for non-hex UID", async () => {
    const app = createApp(createMockD1());
    const r = await app.request("/api/cards/check-uid?uid=gggggggg");
    expect(r.status).toBe(400);
  });

  it("returns exists:false when not found", async () => {
    const app = createApp(createMockD1([]));
    const r = await app.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("returns exists:true with tenantId when found", async () => {
    const app = createApp(createMockD1([["tenant-123"]]));
    const r = await app.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: true, tenantId: "tenant-123" });
  });

  it("normalizes UID with colons and uppercase", async () => {
    const app = createApp(createMockD1([]));
    const r = await app.request("/api/cards/check-uid?uid=04:A2:B3:C4:D5:E6:F7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("accepts 8 hex char UID", async () => {
    const app = createApp(createMockD1([]));
    const r = await app.request("/api/cards/check-uid?uid=04a2b3c4");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("accepts 14 hex char UID", async () => {
    const app = createApp(createMockD1([]));
    const r = await app.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });
});
