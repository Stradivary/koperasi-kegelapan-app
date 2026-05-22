import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { syncSseRoutes, broadcastToTenant, getConnectedClientCount } from "../sync-sse";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    c.env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.route("/api/sync", syncSseRoutes);
  return app;
}

function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe("sync-sse routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe("GET /sse", () => {
    it("returns 401 without auth token", async () => {
      const res = await app.request("/api/sync/sse");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication required");
    });

    it("returns 400 when token has no deviceId", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1" });
      const res = await app.request("/api/sync/sse", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Device ID");
    });

    it("returns SSE stream with valid token", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const res = await app.request("/api/sync/sse", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    });

    it("accepts token via query parameter", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const res = await app.request(`/api/sync/sse?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    });
  });

  describe("POST /broadcast", () => {
    it("returns 401 without auth token", async () => {
      const res = await app.request("/api/sync/broadcast", {
        method: "POST",
        body: JSON.stringify({ type: "transaction", payload: {} }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 with invalid body", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const res = await app.request("/api/sync/broadcast", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 with missing type", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const res = await app.request("/api/sync/broadcast", {
        method: "POST",
        body: JSON.stringify({ payload: { foo: "bar" } }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 with invalid event type", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const res = await app.request("/api/sync/broadcast", {
        method: "POST",
        body: JSON.stringify({ type: "invalid_type", payload: { x: 1 } }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid event type");
    });

    it("returns success with valid broadcast", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const res = await app.request("/api/sync/broadcast", {
        method: "POST",
        body: JSON.stringify({ type: "transaction", payload: { amount: 100 } }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(typeof body.connectedClients).toBe("number");
    });

    it("accepts all valid event types", async () => {
      const token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
      const types = ["card_status_change", "member_update", "transaction", "checkin", "checkout"];
      for (const type of types) {
        const res = await app.request("/api/sync/broadcast", {
          method: "POST",
          body: JSON.stringify({ type, payload: { test: true } }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        expect(res.status).toBe(200);
      }
    });
  });

  describe("broadcastToTenant", () => {
    it("does not throw when no clients connected", () => {
      expect(() =>
        broadcastToTenant("t1", {
          type: "transaction",
          payload: { amount: 50 },
          timestamp: 1234567890,
          sourceDeviceId: "d1",
        }),
      ).not.toThrow();
    });
  });

  describe("getConnectedClientCount", () => {
    it("returns a number", () => {
      const count = getConnectedClientCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("returns a number for specific tenant", () => {
      const count = getConnectedClientCount("nonexistent-tenant-xyz");
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
