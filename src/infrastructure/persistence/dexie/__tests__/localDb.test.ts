import { describe, it, expect, vi, beforeEach } from "vitest";

// Set up globals BEFORE vi.mock runs (vi.hoisted ensures this runs before mock hoisting)
const testState = vi.hoisted(() => {
  const upgradeCallbacks: Array<(tx: unknown) => unknown> = [];
  const storeDefinitions: Array<Record<string, string>> = [];
  const versionCalls: number[] = [];
  return { upgradeCallbacks, storeDefinitions, versionCalls };
});

vi.mock("dexie", () => {
  const MockDexie = class {
    users: unknown;
    cards: unknown;
    auditLog: unknown;
    sessionGrants: unknown;
    transactionLog: unknown;
    syncCursors: unknown;
    deviceInfo: unknown;

    constructor(_name: string) {
      // no-op
    }

    version(v: number) {
      testState.versionCalls.push(v);
      return {
        stores: (schema: Record<string, string>) => {
          testState.storeDefinitions.push(schema);
          return {
            upgrade: (cb: (tx: unknown) => unknown) => {
              testState.upgradeCallbacks.push(cb);
            },
          };
        },
      };
    }
  };

  return { default: MockDexie };
});

// Import triggers LocalDb constructor
import { localDb } from "#/infrastructure/persistence/dexie/localDb";

describe("localDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("database instance", () => {
    it("exports a localDb instance", () => {
      expect(localDb).toBeDefined();
    });

    it("defines 5 schema versions", () => {
      expect(testState.versionCalls).toContain(1);
      expect(testState.versionCalls).toContain(2);
      expect(testState.versionCalls).toContain(3);
      expect(testState.versionCalls).toContain(4);
      expect(testState.versionCalls).toContain(5);
      expect(testState.versionCalls).toHaveLength(5);
    });
  });

  describe("schema definitions", () => {
    it("v1 defines users, cards, auditLog, sessionGrants", () => {
      expect(testState.storeDefinitions[0]).toEqual({
        users: "[tenantId+userId], tenantId",
        cards: "[tenantId+cardId], tenantId, userId",
        auditLog: "++id, tenantId, cardId, [tenantId+timestamp]",
        sessionGrants: "grantId, tenantId, accountId",
      });
    });

    it("v2 adds transactionLog, syncCursors, deviceInfo tables", () => {
      expect(testState.storeDefinitions[1]).toHaveProperty("transactionLog");
      expect(testState.storeDefinitions[1]).toHaveProperty("syncCursors");
      expect(testState.storeDefinitions[1]).toHaveProperty("deviceInfo");
    });

    it("v3 adds syncStatus+timestamp compound index to transactionLog", () => {
      expect(testState.storeDefinitions[2].transactionLog).toContain(
        "[tenantId+syncStatus+timestamp]",
      );
    });

    it("v4 adds syncStatus compound index to users and cards", () => {
      expect(testState.storeDefinitions[3].users).toContain("[tenantId+syncStatus]");
      expect(testState.storeDefinitions[3].cards).toContain("[tenantId+syncStatus]");
    });

    it("v5 retains all indexes from v4", () => {
      expect(testState.storeDefinitions[4]).toEqual(testState.storeDefinitions[3]);
    });
  });

  describe("version 4 upgrade", () => {
    it("sets syncStatus to 'synced' for users without syncStatus", async () => {
      const users = [
        { tenantId: "t1", userId: "u1", name: "Alice", syncStatus: undefined },
        { tenantId: "t1", userId: "u2", name: "Bob", syncStatus: "pending" },
      ];
      const cards = [{ tenantId: "t1", cardId: "c1", syncStatus: undefined }];

      const userModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        users.forEach(cb);
        return Promise.resolve();
      });
      const cardModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        cards.forEach(cb);
        return Promise.resolve();
      });

      const tx = {
        table: vi.fn((name: string) => {
          if (name === "users") {
            return { toCollection: () => ({ modify: userModify }) };
          }
          if (name === "cards") {
            return { toCollection: () => ({ modify: cardModify }) };
          }
          return { toCollection: () => ({ modify: vi.fn().mockResolvedValue(undefined) }) };
        }),
      };

      // upgradeCallbacks[0] is v4 upgrade (first upgrade registered)
      await testState.upgradeCallbacks[0](tx);

      // User without syncStatus gets "synced"
      expect(users[0].syncStatus).toBe("synced");
      // User with existing syncStatus is unchanged
      expect(users[1].syncStatus).toBe("pending");
      // Card without syncStatus gets "synced"
      expect(cards[0].syncStatus).toBe("synced");
    });

    it("does not overwrite existing syncStatus on users", async () => {
      const users = [{ tenantId: "t1", userId: "u1", name: "Alice", syncStatus: "pending" }];

      const userModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        users.forEach(cb);
        return Promise.resolve();
      });

      const tx = {
        table: vi.fn((name: string) => {
          if (name === "users") {
            return { toCollection: () => ({ modify: userModify }) };
          }
          return { toCollection: () => ({ modify: vi.fn().mockResolvedValue(undefined) }) };
        }),
      };

      await testState.upgradeCallbacks[0](tx);

      expect(users[0].syncStatus).toBe("pending");
    });

    it("does not overwrite existing syncStatus on cards", async () => {
      const cards = [{ tenantId: "t1", cardId: "c1", syncStatus: "pending" }];

      const cardModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        cards.forEach(cb);
        return Promise.resolve();
      });

      const tx = {
        table: vi.fn((name: string) => {
          if (name === "cards") {
            return { toCollection: () => ({ modify: cardModify }) };
          }
          return { toCollection: () => ({ modify: vi.fn().mockResolvedValue(undefined) }) };
        }),
      };

      await testState.upgradeCallbacks[0](tx);

      expect(cards[0].syncStatus).toBe("pending");
    });
  });

  describe("version 5 upgrade", () => {
    it("converts numeric userId to string in users table", async () => {
      const users = [
        { tenantId: "t1", userId: 1001, name: "Alice" },
        { tenantId: "t1", userId: "1002", name: "Bob" },
      ];
      const cards = [{ tenantId: "t1", cardId: "c1", userId: 42 }];
      const transactions = [{ tenantId: "t1", cardId: "c1", userId: 99 }];

      const userModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        users.forEach(cb);
        return Promise.resolve();
      });
      const cardModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        cards.forEach(cb);
        return Promise.resolve();
      });
      const txLogModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        transactions.forEach(cb);
        return Promise.resolve();
      });

      const tx = {
        table: vi.fn((name: string) => {
          if (name === "users") {
            return { toCollection: () => ({ modify: userModify }) };
          }
          if (name === "cards") {
            return { toCollection: () => ({ modify: cardModify }) };
          }
          if (name === "transactionLog") {
            return { toCollection: () => ({ modify: txLogModify }) };
          }
          return { toCollection: () => ({ modify: vi.fn() }) };
        }),
      };

      // upgradeCallbacks[1] is v5 upgrade (second upgrade registered)
      await testState.upgradeCallbacks[1](tx);

      // Numeric userId converted to string
      expect(users[0].userId).toBe("1001");
      // Already-string userId unchanged
      expect(users[1].userId).toBe("1002");
      // Card userId converted
      expect(cards[0].userId).toBe("42");
      // TransactionLog userId converted
      expect(transactions[0].userId).toBe("99");
    });

    it("does not modify userId that is already a string", async () => {
      const users = [{ tenantId: "t1", userId: "u-abc", name: "Alice" }];
      const cards = [{ tenantId: "t1", cardId: "c1", userId: "u-abc" }];
      const transactions = [{ tenantId: "t1", cardId: "c1", userId: "u-abc" }];

      const userModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        users.forEach(cb);
        return Promise.resolve();
      });
      const cardModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        cards.forEach(cb);
        return Promise.resolve();
      });
      const txLogModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        transactions.forEach(cb);
        return Promise.resolve();
      });

      const tx = {
        table: vi.fn((name: string) => {
          if (name === "users") {
            return { toCollection: () => ({ modify: userModify }) };
          }
          if (name === "cards") {
            return { toCollection: () => ({ modify: cardModify }) };
          }
          if (name === "transactionLog") {
            return { toCollection: () => ({ modify: txLogModify }) };
          }
          return { toCollection: () => ({ modify: vi.fn() }) };
        }),
      };

      await testState.upgradeCallbacks[1](tx);

      expect(users[0].userId).toBe("u-abc");
      expect(cards[0].userId).toBe("u-abc");
      expect(transactions[0].userId).toBe("u-abc");
    });

    it("handles null userId in cards and transactionLog without modification", async () => {
      const users = [{ tenantId: "t1", userId: "u1", name: "Alice" }];
      const cards = [{ tenantId: "t1", cardId: "c1", userId: null }];
      const transactions = [{ tenantId: "t1", cardId: "c1", userId: null }];

      const userModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        users.forEach(cb);
        return Promise.resolve();
      });
      const cardModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        cards.forEach(cb);
        return Promise.resolve();
      });
      const txLogModify = vi.fn((cb: (item: Record<string, unknown>) => void) => {
        transactions.forEach(cb);
        return Promise.resolve();
      });

      const tx = {
        table: vi.fn((name: string) => {
          if (name === "users") {
            return { toCollection: () => ({ modify: userModify }) };
          }
          if (name === "cards") {
            return { toCollection: () => ({ modify: cardModify }) };
          }
          if (name === "transactionLog") {
            return { toCollection: () => ({ modify: txLogModify }) };
          }
          return { toCollection: () => ({ modify: vi.fn() }) };
        }),
      };

      await testState.upgradeCallbacks[1](tx);

      // null is not typeof "number", so it stays null
      expect(cards[0].userId).toBeNull();
      expect(transactions[0].userId).toBeNull();
    });
  });
});
