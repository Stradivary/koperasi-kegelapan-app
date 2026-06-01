/**
 * Tests for api/src/middleware/syncAnalytics.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { syncAnalytics } from "../syncAnalytics";

function makeToken(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload));
  return `header.${encoded}.sig`;
}

function makeApp(_analyticsBinding?: { writeDataPoint: ReturnType<typeof vi.fn> }) {
  const app = new Hono<{
    Bindings: { DB: D1Database; SESSION_MASTER_KEY: string; SYNC_ANALYTICS?: unknown };
  }>();
  app.use("*", syncAnalytics);
  app.get("/api/sync/pull", (c) => c.json({ ok: true }));
  app.post("/api/sync/push", (c) => c.json({ accepted: 3, rejected: ["a"] }));
  app.post("/api/sync/push-entities", (c) =>
    c.json({ membersAccepted: 2, cardsAccepted: 1, membersRejected: [], cardsRejected: ["x"] }),
  );
  app.get("/api/sync/sse", (c) => c.text("stream"));
  app.get("/api/sync/broadcast", (c) => c.json({ ok: true }));
  app.get("/api/sync/other-endpoint", (c) => c.json({ ok: true }));
  return app;
}

describe("syncAnalytics middleware - no binding", () => {
  it("no-ops when SYNC_ANALYTICS binding is not configured", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/api/sync/pull"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key" },
    );
    expect(res.status).toBe(200);
  });
});

describe("syncAnalytics middleware - with binding", () => {
  let writeDataPoint: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeDataPoint = vi.fn();
  });

  it("writes a data point after a GET /pull request", async () => {
    const app = makeApp({ writeDataPoint });
    const token = makeToken({ tenantId: "t-1", deviceId: "d-1" });

    const res = await app.request(
      new Request("http://localhost/api/sync/pull", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    expect(res.status).toBe(200);
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe("sync/pull");
    expect(call.blobs[1]).toBe("t-1");
    expect(call.blobs[2]).toBe("d-1");
    expect(call.blobs[3]).toBe("GET");
    expect(call.doubles[0]).toBe(200);
  });

  it("extracts accepted/rejected counts for push endpoint", async () => {
    const app = makeApp({ writeDataPoint });
    const token = makeToken({ tenantId: "t-2", deviceId: "d-2" });

    await app.request(
      new Request("http://localhost/api/sync/push", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe("sync/push");
    expect(call.doubles[4]).toBe(3); // acceptedCount
    expect(call.doubles[5]).toBe(1); // rejectedCount (array length)
  });

  it("extracts accepted/rejected counts for push-entities endpoint", async () => {
    const app = makeApp({ writeDataPoint });
    const token = makeToken({ tenantId: "t-3", deviceId: "d-3" });

    await app.request(
      new Request("http://localhost/api/sync/push-entities", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe("sync/push-entities");
    expect(call.doubles[4]).toBe(3); // membersAccepted + cardsAccepted
    expect(call.doubles[5]).toBe(1); // membersRejected.length + cardsRejected.length
  });

  it("uses 'unknown' for tenantId/deviceId when no auth header", async () => {
    const app = makeApp({ writeDataPoint });

    await app.request(
      new Request("http://localhost/api/sync/pull"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[1]).toBe("unknown");
    expect(call.blobs[2]).toBe("unknown");
  });

  it("labels SSE endpoint correctly", async () => {
    const app = makeApp({ writeDataPoint });

    await app.request(
      new Request("http://localhost/api/sync/sse"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe("sync/sse");
  });

  it("labels broadcast endpoint correctly", async () => {
    const app = makeApp({ writeDataPoint });

    await app.request(
      new Request("http://localhost/api/sync/broadcast"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe("sync/broadcast");
  });

  it("labels unknown sync endpoints as sync/other", async () => {
    const app = makeApp({ writeDataPoint });

    await app.request(
      new Request("http://localhost/api/sync/other-endpoint"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe("sync/other");
  });

  it("does not throw when writeDataPoint throws", async () => {
    writeDataPoint.mockImplementation(() => {
      throw new Error("Analytics write failed");
    });
    const app = makeApp({ writeDataPoint });

    const res = await app.request(
      new Request("http://localhost/api/sync/pull"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    // Request should still succeed even if analytics write fails
    expect(res.status).toBe(200);
  });

  it("sets error reason for 4xx responses", async () => {
    const app = new Hono<{
      Bindings: { DB: D1Database; SESSION_MASTER_KEY: string; SYNC_ANALYTICS?: unknown };
    }>();
    app.use("*", syncAnalytics);
    app.get("/api/sync/pull", (c) => c.json({ error: "not found" }, 404));

    await app.request(
      new Request("http://localhost/api/sync/pull"),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key", SYNC_ANALYTICS: { writeDataPoint } },
    );

    const call = writeDataPoint.mock.calls[0][0];
    expect(call.doubles[0]).toBe(404);
    expect(call.blobs[4]).toBe("http_404");
  });
});
