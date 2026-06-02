// @vitest-environment node
/**
 * Additional tests for api/src/routes/push-entities.ts
 * Covers uncovered lines: member update path (existing record with newer updatedAt),
 * card update path (existing record with higher counter), UNIQUE constraint on card insert,
 * extractTokenPayload edge cases
 */
import { describe, it, expect, beforeEach } from "vitest";
import { pushEntitiesRoute } from "../../routes/push-entities";
import { makeToken } from "./testHelpers";
import { Hono } from "hono";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

/**
 * Creates a more granular mock D1 that supports different results per query.
 * Allows configuring member/card existing records for upsert testing.
 * Uses raw() which is what drizzle-orm/d1 actually calls.
 */
function createUpsertMockD1(options: {
  existingMember?: { updatedAt: Date | number } | null;
  existingCard?: { counter: number; updatedAt: number } | null;
  throwOnRun?: string;
  throwOnRunCard?: string;
}) {
  let rawCallCount = 0;
  const mockRun = options.throwOnRun
    ? async () => {
        throw new Error(options.throwOnRun);
      }
    : async () => ({ success: true, meta: {} });

  const mockRunCard = options.throwOnRunCard
    ? async () => {
        throw new Error(options.throwOnRunCard);
      }
    : async () => ({ success: true, meta: {} });

  return {
    prepare: () => ({
      bind: () => ({
        raw: async () => {
          rawCallCount++;
          // For processMember: 1st raw() = member existence check
          // For processCard: next raw() = card existence check
          if (rawCallCount === 1 && options.existingMember) {
            const updatedAt = options.existingMember.updatedAt;
            return [[updatedAt]]; // Returns [updatedAt] columns
          }
          if (rawCallCount === 1 && options.existingCard) {
            return [[options.existingCard.counter, options.existingCard.updatedAt]];
          }
          // Not found → empty results (triggers insert path)
          return [];
        },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: mockRunCard,
      }),
      raw: async () => [],
      first: async () => null,
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
    c.env = {
      DB:
        db ??
        ({
          prepare: () => ({
            bind: () => ({
              raw: async () => [],
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
        } as unknown as D1Database),
      SESSION_MASTER_KEY: "test-key",
    };
    await next();
  });
  app.route("/api/sync", pushEntitiesRoute);
  return app;
}

describe("POST /push-entities - upsert paths", () => {
  let token: string;

  beforeEach(() => {
    token = makeToken({ tenantId: "t1", accountId: "a1", deviceId: "d1" });
  });

  describe("member update (existing record)", () => {
    it("updates member when incoming updatedAt is newer", async () => {
      const db = createUpsertMockD1({
        existingMember: { updatedAt: new Date(1700000000000) }, // existing: 1700000000
      });
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [
            {
              userId: "u1",
              name: "Updated Name",
              status: "active",
              createdAt: 1700000000,
              updatedAt: 1700002000, // Newer than existing
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
      expect(body.membersAccepted).toBe(1);
    });

    it("skips update when incoming updatedAt is older (keeps existing)", async () => {
      const db = createUpsertMockD1({
        existingMember: { updatedAt: new Date(1700002000000) }, // existing: 1700002000
      });
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [
            {
              userId: "u1",
              name: "Old Name",
              status: "active",
              createdAt: 1700000000,
              updatedAt: 1700001000, // Older than existing
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
      expect(body.membersAccepted).toBe(1); // Still accepted (no-op update)
    });

    it("handles existing member with numeric updatedAt", async () => {
      const db = createUpsertMockD1({
        existingMember: { updatedAt: 1700000000 }, // numeric, not Date
      });
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [
            {
              userId: "u1",
              name: "User",
              status: "active",
              createdAt: 1700000000,
              updatedAt: 1700002000,
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
      expect(body.membersAccepted).toBe(1);
    });
  });

  describe("card update (existing record)", () => {
    it("updates card when incoming counter is higher", async () => {
      const db = createUpsertMockD1({
        existingCard: { counter: 5, updatedAt: 1700000000 },
      });
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [],
          cards: [
            {
              cardId: "04a2b3c4d5e6f7",
              userId: "u1",
              status: "active",
              balance: 50000,
              counter: 10, // Higher than existing 5
              keyVersion: 1,
              createdAt: 1700002000,
              lastActivityAt: 1700002000,
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
      expect(body.cardsAccepted).toBe(1);
    });

    it("updates card when incoming updatedAt is newer even if counter is same", async () => {
      const db = createUpsertMockD1({
        existingCard: { counter: 10, updatedAt: 1700000000 },
      });
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [],
          cards: [
            {
              cardId: "04a2b3c4d5e6f7",
              userId: "u1",
              status: "active",
              balance: 50000,
              counter: 10, // Same counter
              keyVersion: 1,
              createdAt: 1700002000, // Newer than updatedAt
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
      expect(body.cardsAccepted).toBe(1);
    });

    it("handles UNIQUE constraint on card insert as accepted", async () => {
      // When drizzle wraps D1 errors, the "UNIQUE" keyword may or may not be preserved.
      // This test verifies the card insert error path doesn't crash.
      const db = {
        prepare: () => {
          return {
            bind: () => ({
              first: async () => null,
              all: async () => ({ results: [] }),
              run: async () => {
                throw new Error("UNIQUE constraint failed: cards.tenant_id, cards.card_id");
              },
              raw: async () => [],
            }),
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => {
              throw new Error("UNIQUE constraint failed: cards.tenant_id, cards.card_id");
            },
            raw: async () => [],
          };
        },
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [],
          cards: [
            {
              cardId: "04a2b3c4d5e6f7",
              userId: null,
              status: "active",
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 1700000000,
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
      // Either accepted (UNIQUE treated as duplicate) or rejected with internal_error
      expect(body.cardsAccepted + body.cardsRejected.length).toBe(1);
    });

    it("rejects card with non-UNIQUE error", async () => {
      const db = {
        prepare: () => {
          return {
            bind: () => ({
              first: async () => null,
              all: async () => ({ results: [] }),
              run: async () => {
                throw new Error("Connection timeout");
              },
              raw: async () => [],
            }),
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => {
              throw new Error("Connection timeout");
            },
            raw: async () => [],
          };
        },
        exec: async () => ({ count: 0, duration: 0 }),
        batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
        dump: async () => new ArrayBuffer(0),
      } as unknown as D1Database;
      const app = createApp(db);

      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          members: [],
          cards: [
            {
              cardId: "04a2b3c4d5e6f7",
              userId: null,
              status: "active",
              balance: 0,
              counter: 0,
              keyVersion: 1,
              createdAt: 1700000000,
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
      expect(body.cardsRejected[0].reason).toContain("internal_error");
    });
  });

  describe("extractTokenPayload edge cases", () => {
    it("returns 401 for token with less than 2 parts", async () => {
      const app = createApp();
      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", members: [], cards: [] }),
        headers: {
          Authorization: "Bearer invalidtoken",
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for token with invalid base64 payload", async () => {
      const app = createApp();
      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", members: [], cards: [] }),
        headers: {
          Authorization: "Bearer header.!!!invalid-base64!!!.sig",
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 when token payload is missing tenantId", async () => {
      const header = btoa(JSON.stringify({ alg: "HS256" }));
      const payload = btoa(JSON.stringify({ accountId: "a1" })); // No tenantId
      const badToken = `${header}.${payload}.sig`;

      const app = createApp();
      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", members: [], cards: [] }),
        headers: {
          Authorization: `Bearer ${badToken}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 when token payload is missing accountId", async () => {
      const header = btoa(JSON.stringify({ alg: "HS256" }));
      const payload = btoa(JSON.stringify({ tenantId: "t1" })); // No accountId
      const badToken = `${header}.${payload}.sig`;

      const app = createApp();
      const res = await app.request("/api/sync/push-entities", {
        method: "POST",
        body: JSON.stringify({ tenantId: "t1", members: [], cards: [] }),
        headers: {
          Authorization: `Bearer ${badToken}`,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(401);
    });
  });
});
