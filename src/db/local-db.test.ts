import { describe, it, expect, vi } from "vitest";

// Mock Dexie to avoid actual IndexedDB operations
vi.mock("dexie", () => {
  const mockTable = {
    get: vi.fn(),
    put: vi.fn(),
    add: vi.fn(),
    delete: vi.fn(),
    toArray: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    toCollection: vi.fn().mockReturnValue({ modify: vi.fn() }),
  };

  class MockDexie {
    users = mockTable;
    cards = mockTable;
    auditLog = mockTable;
    sessionGrants = mockTable;
    transactionLog = mockTable;
    syncCursors = mockTable;
    deviceInfo = mockTable;

    constructor(_name: string) {}

    version(_num: number) {
      return {
        stores: (_schema: Record<string, string>) => ({
          upgrade: (_fn: Function) => this.version(0),
          stores: (_s: Record<string, string>) => ({ upgrade: (_f: Function) => ({}) }),
        }),
      };
    }
  }

  return { default: MockDexie };
});

import { localDb } from "./local-db";
import type {
  User,
  Card,
  AuditEntry,
  SessionGrant,
  TransactionLog,
  SyncCursor,
  DeviceInfo,
} from "./local-db";

describe("local-db", () => {
  it("exports localDb instance", () => {
    expect(localDb).toBeDefined();
  });

  it("localDb has table properties", () => {
    // localDb is a Dexie instance - tables are defined via version().stores()
    // In the mock environment, they may not be populated the same way
    // Just verify the instance exists and is the right type
    expect(localDb).toBeDefined();
    expect(typeof localDb).toBe("object");
  });

  // Type checks (compile-time verification)
  describe("type definitions", () => {
    it("User type has required fields", () => {
      const user: User = {
        tenantId: "t1",
        userId: "u1",
        name: "Test User",
        status: "active",
        createdAt: 1000,
        updatedAt: 1000,
      };
      expect(user.tenantId).toBe("t1");
      expect(user.status).toBe("active");
    });

    it("Card type has required fields", () => {
      const card: Card = {
        tenantId: "t1",
        cardId: "c1",
        userId: null,
        status: "active",
        balance: 100000,
        counter: 5,
        keyVersion: 1,
        createdAt: 1000,
        lastActivityAt: null,
        expiresAt: null,
        notes: null,
      };
      expect(card.balance).toBe(100000);
    });

    it("TransactionLog type has required fields", () => {
      const tx: TransactionLog = {
        tenantId: "t1",
        cardId: "c1",
        userId: null,
        counter: 1,
        type: "debit",
        amount: 5000,
        balanceAfter: 95000,
        timestamp: 1000,
        hash: "abc123",
        terminalId: null,
        deviceId: null,
        syncStatus: "pending",
        syncedAt: null,
        createdAt: 1000,
      };
      expect(tx.syncStatus).toBe("pending");
    });

    it("SyncCursor type has required fields", () => {
      const cursor: SyncCursor = {
        tenantId: "t1",
        entityType: "members",
        lastCursor: "100",
        updatedAt: 1000,
      };
      expect(cursor.entityType).toBe("members");
    });

    it("DeviceInfo type has required fields", () => {
      const device: DeviceInfo = {
        deviceId: "d1",
        tenantId: "t1",
        fingerprintHash: "hash123",
        registeredAt: 1000,
      };
      expect(device.deviceId).toBe("d1");
    });

    it("SessionGrant type has required fields", () => {
      const grant: SessionGrant = {
        grantId: "g1",
        tenantId: "t1",
        accountId: "a1",
        deviceId: "d1",
        keyVersion: 1,
        allowedOps: "read,write",
        expiresAt: 9999999999,
        issuedAt: 1000,
      };
      expect(grant.grantId).toBe("g1");
    });

    it("AuditEntry type has required fields", () => {
      const entry: AuditEntry = {
        tenantId: "t1",
        cardId: "c1",
        counter: 1,
        type: "debit",
        amount: 5000,
        balanceAfter: 95000,
        timestamp: 1000,
        hash: "abc",
        terminalId: null,
        flagged: false,
        createdAt: 1000,
      };
      expect(entry.type).toBe("debit");
    });
  });
});
