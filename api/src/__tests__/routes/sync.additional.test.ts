// @vitest-environment node
/**
 * Additional tests for api/src/routes/sync.ts
 * Covers uncovered lines: topup limit, processTransaction paths,
 * pull with data (Date handling, bytesToHex), devices error path
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncRoutes } from "../../routes/sync";
import { makeToken, createTestApp } from "./testHelpers";

describe("sync routes - additional coverage", () => {
  let token: string;

  beforeEach(() => {
    token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
  });

  describe("POST /push - topup amount limit", () => {
    it("rejects topup transactions exceeding 2,000,000", async () => {
      const app = createTestApp(syncRoutes, "/api/sync");
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 1,
              type: "topup",
              amount: 2000001,
              balanceAfter: 2000001,
              timestamp: 1000,
              hash: "abc123",
              idempotencyKey: "key-topup-1",
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
      expect(body.rejected[0].reason).toBe("topup_amount_exceeds_limit");
    });

    it("accepts topup transactions at exactly 2,000,000", async () => {
      const app = createTestApp(syncRoutes, "/api/sync");
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 1,
              type: "topup",
              amount: 2000000,
              balanceAfter: 2000000,
              timestamp: 1000,
              hash: "abc123",
              idempotencyKey: "key-topup-2",
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
      // May be accepted or rejected for stale_counter depending on mock but NOT rejected for amount
      if (body.rejected.length > 0) {
        expect(body.rejected[0].reason).not.toBe("topup_amount_exceeds_limit");
      }
    });
  });

  describe("POST /push - processTransaction paths", () => {
    it("accepts duplicate idempotency key silently", async () => {
      // drizzle uses prepare().bind().raw() for .get() calls
      // For idempotency check: if raw() returns [[id]], record exists → accepted as duplicate
      const db = {
        prepare: () => ({
          bind: () => ({
            raw: async () => [[42]], // Always returns a record → idempotency hit
            first: async () => ({ id: 42 }),
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: {} }),
          }),
          raw: async () => [[42]],
          first: async () => ({ id: 42 }),
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: {} }),
        }),
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
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
              balanceAfter: 900,
              timestamp: 1000,
              hash: "abc123",
              idempotencyKey: "duplicate-key",
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
      // Duplicate is silently accepted
      expect(body.accepted).toBe(1);
      expect(body.rejected).toEqual([]);
    });

    it("rejects transactions with stale counter", async () => {
      // drizzle uses prepare(sql).bind(params).raw() for .get() calls
      // Returns [[values]] for found, [] for not found
      // For processTransaction:
      //   1st prepare+raw: idempotency check → [] (not found)
      //   2nd prepare+raw: card counter check → [[10]] (counter=10)
      let rawCallCount = 0;
      const db = {
        prepare: () => ({
          bind: () => ({
            raw: async () => {
              rawCallCount++;
              if (rawCallCount === 1) return []; // No duplicate idempotency
              if (rawCallCount === 2) return [[10]]; // Card has counter=10
              return [];
            },
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: {} }),
          }),
          raw: async () => [],
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: {} }),
        }),
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          transactions: [
            {
              cardId: "04a2b3c4d5e6f7",
              counter: 5, // Less than card's counter of 10
              type: "debit",
              amount: 100,
              balanceAfter: 900,
              timestamp: 1000,
              hash: "abc123",
              idempotencyKey: "stale-key",
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
      expect(body.rejected.length).toBe(1);
      expect(body.rejected[0].reason).toBe("stale_counter");
    });

    it("handles error in processTransaction gracefully", async () => {
      // When insert fails, processTransaction catches the error.
      // Due to drizzle wrapping errors, the error is caught and returned as internal_error.
      const db = {
        prepare: () => ({
          bind: () => ({
            raw: async () => {
              // Throw on raw() to simulate DB failure during query
              throw new Error("UNIQUE constraint failed");
            },
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => {
              throw new Error("UNIQUE constraint failed");
            },
          }),
          raw: async () => {
            throw new Error("UNIQUE constraint failed");
          },
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => {
            throw new Error("UNIQUE constraint failed");
          },
        }),
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
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
              balanceAfter: 900,
              timestamp: 1000,
              hash: "abc123",
              idempotencyKey: "fail-key",
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
      // The error is caught and handled (either accepted for UNIQUE or rejected with internal_error)
      expect(body.accepted + body.rejected.length).toBe(1);
    });

    it("logs tenantId mismatch between payload and token", async () => {
      const app = createTestApp(syncRoutes, "/api/sync");
      const res = await app.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "different-tenant",
          transactions: [],
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      // Should still succeed - uses token tenantId
      expect(res.status).toBe(200);
    });
  });

  describe("GET /pull - with data", () => {
    it("returns members with Date-type timestamps and cursor advancement", async () => {
      // drizzle uses raw() for all queries. Column order matches select() field order.
      // Members: tenantId, userId, name, status, createdAt, updatedAt
      let rawCallCount = 0;
      const db = {
        prepare: () => ({
          bind: () => ({
            raw: async () => {
              rawCallCount++;
              // 1st raw: members query
              if (rawCallCount === 1)
                return [["t1", "u1", "Test User", "active", 1700000000, 1700001000]];
              // 2nd raw: cards query (empty)
              if (rawCallCount === 2) return [];
              // 3rd raw: transactions query (empty)
              return [];
            },
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: {} }),
          }),
          raw: async () => [],
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: {} }),
        }),
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
      const res = await app.request("/api/sync/pull?membersCursor=0&cardsCursor=0&txCursor=0", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members.data.length).toBe(1);
      expect(body.members.data[0].userId).toBe("u1");
      expect(body.members.data[0].name).toBe("Test User");
      expect(body.members.cursor).toBe("1700001000");
      expect(body.members.hasMore).toBe(false);
    });

    it("handles card data with Uint8Array cardId (bytesToHex) and Date fields", async () => {
      // Cards select: tenantId, cardId, userId, status, balance, counter, keyVersion, createdAt, lastActivityAt, expiresAt, notes, updatedAt
      const cardIdBytes = new Uint8Array([0x04, 0xa2, 0xb3, 0xc4, 0xd5, 0xe6, 0xf7]);
      let rawCallCount = 0;

      const db = {
        prepare: () => ({
          bind: () => ({
            raw: async () => {
              rawCallCount++;
              if (rawCallCount === 1) return []; // members
              if (rawCallCount === 2)
                return [
                  [
                    "t1",
                    cardIdBytes,
                    "u1",
                    "active",
                    50000,
                    10,
                    1,
                    1700000000,
                    1700001000,
                    1800000000,
                    "test notes",
                    1700001000,
                  ],
                ];
              return []; // transactions
            },
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: {} }),
          }),
          raw: async () => [],
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: {} }),
        }),
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
      const res = await app.request("/api/sync/pull", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cards.data.length).toBe(1);
      expect(body.cards.data[0].cardId).toBe("04a2b3c4d5e6f7");
      expect(body.cards.data[0].lastActivityAt).toBe(1700001000);
      expect(body.cards.data[0].expiresAt).toBe(1800000000);
      expect(body.cards.data[0].notes).toBe("test notes");
    });

    it("handles card data with ArrayBuffer cardId (bytesToHex)", async () => {
      const cardIdArrayBuffer = new Uint8Array([0x04, 0xa2, 0xb3]).buffer;
      let rawCallCount = 0;

      const db = {
        prepare: () => ({
          bind: () => ({
            raw: async () => {
              rawCallCount++;
              if (rawCallCount === 1) return []; // members
              if (rawCallCount === 2)
                return [
                  [
                    "t1",
                    cardIdArrayBuffer,
                    null,
                    "active",
                    0,
                    0,
                    1,
                    1700000000,
                    null,
                    null,
                    null,
                    1700000000,
                  ],
                ];
              return []; // transactions
            },
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: {} }),
          }),
          raw: async () => [],
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: {} }),
        }),
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
      const res = await app.request("/api/sync/pull", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cards.data.length).toBe(1);
      expect(body.cards.data[0].cardId).toBe("04a2b3");
      expect(body.cards.data[0].lastActivityAt).toBeNull();
      expect(body.cards.data[0].expiresAt).toBeNull();
    });

    it("handles pull with tenantId mismatch in query params", async () => {
      const app = createTestApp(syncRoutes, "/api/sync");
      const res = await app.request("/api/sync/pull?tenantId=different-tenant", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });

    it("handles invalid cursor values gracefully", async () => {
      const app = createTestApp(syncRoutes, "/api/sync");
      const res = await app.request(
        "/api/sync/pull?membersCursor=invalid&cardsCursor=abc&txCursor=xyz",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(res.status).toBe(200);
    });
  });

  describe("GET /devices - error path", () => {
    it("returns 500 when database query fails", async () => {
      const db = {
        prepare: () => ({
          bind: () => ({
            first: async () => {
              throw new Error("Connection lost");
            },
            all: async () => {
              throw new Error("Connection lost");
            },
            run: vi.fn().mockRejectedValue(new Error("Connection lost")),
            raw: async () => {
              throw new Error("Connection lost");
            },
          }),
          first: async () => {
            throw new Error("Connection lost");
          },
          all: async () => {
            throw new Error("Connection lost");
          },
          run: vi.fn().mockRejectedValue(new Error("Connection lost")),
          raw: async () => {
            throw new Error("Connection lost");
          },
        }),
        exec: async () => {
          throw new Error("Connection lost");
        },
        batch: async () => {
          throw new Error("Connection lost");
        },
        dump: async () => {
          throw new Error("Connection lost");
        },
      } as unknown as D1Database;

      const app = createTestApp(syncRoutes, "/api/sync", db);
      const res = await app.request("/api/sync/devices", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to fetch devices");
    });
  });
});
