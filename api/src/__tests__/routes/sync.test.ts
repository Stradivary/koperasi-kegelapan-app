import { describe, it, expect, beforeEach } from "vitest";
import { syncRoutes } from "../../routes/sync";
import { makeToken, createTestApp } from "./testHelpers";

describe("sync routes", () => {
  let app: ReturnType<typeof createTestApp>;
  let token: string;

  beforeEach(() => {
    app = createTestApp(syncRoutes, "/api/sync");
    token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
  });

  describe("POST /push", () => {
    it("returns 401 without auth token", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", transactions: [] }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 with malformed body", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: "not json",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when transactions is not an array", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", transactions: "not-array" }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
    });

    it("returns success with empty transactions", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", transactions: [] }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accepted).toBe(0);
      expect(body.rejected).toEqual([]);
      expect(body.serverCursor).toBeDefined();
    });

    it("returns 400 when batch exceeds 500", async () => {
      const transactions = Array.from({ length: 501 }, (_, i) => ({
        cardId: "04a2b3c4d5e6f7",
        counter: i,
        type: "debit",
        amount: 100,
        balanceAfter: 900,
        timestamp: 1000,
        hash: "abc123",
        idempotencyKey: `key-${i}`,
      }));
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", transactions }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
    });

    it("rejects transactions with missing required fields", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [{ cardId: "04a2b3c4d5e6f7" }], // missing fields
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rejected.length).toBe(1);
      expect(body.rejected[0].reason).toBe("malformed_event");
    });

    it("rejects transactions with invalid type", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 1,
              type: "invalid_type",
              amount: 100,
              balanceAfter: 900,
              timestamp: 1000,
              hash: "abc",
              idempotencyKey: "key-1",
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
      expect(body.rejected[0].reason).toBe("invalid_type");
    });

    it("rejects transactions with invalid amount", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 1,
              type: "debit",
              amount: -1,
              balanceAfter: 900,
              timestamp: 1000,
              hash: "abc",
              idempotencyKey: "key-1",
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
      expect(body.rejected[0].reason).toBe("invalid_amount");
    });

    it("rejects transactions with invalid balance", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 1,
              type: "debit",
              amount: 100,
              balanceAfter: -1,
              timestamp: 1000,
              hash: "abc",
              idempotencyKey: "key-1",
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
      expect(body.rejected[0].reason).toBe("invalid_balance");
    });

    it("rejects transactions with invalid counter", async () => {
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 70000,
              type: "debit",
              amount: 100,
              balanceAfter: 900,
              timestamp: 1000,
              hash: "abc",
              idempotencyKey: "key-1",
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
      expect(body.rejected[0].reason).toBe("invalid_counter");
    });
  });

  describe("GET /pull", () => {
    it("returns 401 without auth token", async () => {
      const res = await app.request("/api/sync/pull");
      expect(res.status).toBe(401);
    });

    it("returns empty data with valid token", async () => {
      const res = await app.request("/api/sync/pull", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toBeDefined();
      expect(body.cards).toBeDefined();
      expect(body.transactions).toBeDefined();
      expect(body.members.data).toEqual([]);
      expect(body.members.hasMore).toBe(false);
    });

    it("accepts cursor query parameters", async () => {
      const res = await app.request(
        "/api/sync/pull?membersCursor=100&cardsCursor=200&txCursor=300",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(200);
    });

    it("handles empty/zero cursors", async () => {
      const res = await app.request("/api/sync/pull?membersCursor=0&cardsCursor=&txCursor=", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("GET /devices", () => {
    it("returns 401 without auth token", async () => {
      const res = await app.request("/api/sync/devices");
      expect(res.status).toBe(401);
    });

    it("returns device list with valid token", async () => {
      const res = await app.request("/api/sync/devices", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.devices).toBeDefined();
    });
  });
});
