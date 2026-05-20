import Dexie, { type Table } from "dexie";

export interface User {
  tenantId: string;
  userId: number;
  name: string;
  status: "active" | "suspended";
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  tenantId: string;
  cardId: string; // hex string
  userId: number | null;
  status: "active" | "blocked_tamper" | "blocked_fraud" | "blocked_expired" | "blocked_admin";
  balance: number;
  counter: number;
  keyVersion: number;
  createdAt: number;
  lastActivityAt: number | null;
  expiresAt: number | null;
  notes: string | null;
}

export interface AuditEntry {
  id?: number; // auto-increment
  tenantId: string;
  cardId: string; // hex string
  counter: number;
  type: "debit" | "credit" | "checkin" | "checkout" | "admin";
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string; // hex string
  terminalId: number | null;
  flagged: boolean;
  createdAt: number;
}

export interface SessionGrant {
  grantId: string;
  tenantId: string;
  accountId: string;
  deviceId: string;
  keyVersion: number;
  allowedOps: string;
  expiresAt: number;
  issuedAt: number;
}

// v2: Sync-related tables

export interface TransactionLog {
  id?: number; // auto-increment
  tenantId: string;
  cardId: string; // hex string
  userId: number | null;
  counter: number;
  type: "debit" | "credit" | "checkin" | "checkout" | "topup" | "admin";
  amount: number;
  balanceAfter: number;
  timestamp: number;
  hash: string; // hex string
  terminalId: number | null;
  deviceId: string | null;
  syncStatus: "pending" | "synced" | "conflict" | "failed";
  syncedAt: number | null;
  createdAt: number;
}

export interface SyncCursor {
  tenantId: string;
  entityType: "members" | "cards" | "transactions";
  lastCursor: string;
  updatedAt: number;
}

export interface DeviceInfo {
  deviceId: string;
  tenantId: string;
  fingerprintHash: string;
  registeredAt: number;
}

class LocalDb extends Dexie {
  users!: Table<User>;
  cards!: Table<Card>;
  auditLog!: Table<AuditEntry>;
  sessionGrants!: Table<SessionGrant>;
  transactionLog!: Table<TransactionLog>;
  syncCursors!: Table<SyncCursor>;
  deviceInfo!: Table<DeviceInfo>;

  constructor() {
    super("koperasi-local");
    this.version(1).stores({
      users: "[tenantId+userId], tenantId",
      cards: "[tenantId+cardId], tenantId, userId",
      auditLog: "++id, tenantId, cardId, [tenantId+timestamp]",
      sessionGrants: "grantId, tenantId, accountId",
    });

    this.version(2).stores({
      users: "[tenantId+userId], tenantId",
      cards: "[tenantId+cardId], tenantId, userId",
      auditLog: "++id, tenantId, cardId, [tenantId+timestamp]",
      sessionGrants: "grantId, tenantId, accountId",
      transactionLog:
        "++id, [tenantId+cardId+counter], [tenantId+syncStatus], [tenantId+timestamp]",
      syncCursors: "[tenantId+entityType]",
      deviceInfo: "deviceId, tenantId",
    });

    this.version(3).stores({
      users: "[tenantId+userId], tenantId",
      cards: "[tenantId+cardId], tenantId, userId",
      auditLog: "++id, tenantId, cardId, [tenantId+timestamp]",
      sessionGrants: "grantId, tenantId, accountId",
      transactionLog:
        "++id, [tenantId+cardId+counter], [tenantId+syncStatus], [tenantId+syncStatus+timestamp], [tenantId+timestamp]",
      syncCursors: "[tenantId+entityType]",
      deviceInfo: "deviceId, tenantId",
    });
  }
}

export const localDb = new LocalDb();
