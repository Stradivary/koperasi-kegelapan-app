import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  tenantId: text("tenant_id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "suspended", "archived"] })
    .notNull()
    .default("active"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const accounts = sqliteTable("accounts", {
  accountId: text("account_id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.tenantId),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", {
    enum: ["admin", "station", "gate", "terminal", "scout", "superadmin", "kiosk"],
  }).notNull(),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const users = sqliteTable(
  "users",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "suspended", "closed"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId] })],
);

export const cards = sqliteTable(
  "cards",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId),
    cardId: blob("card_id").notNull(),
    userId: integer("user_id"),
    status: text("status", {
      enum: ["active", "ACTIVE", "BLOCKED_TAMPER", "BLOCKED_FRAUD", "BLOCKED_EXPIRED", "BLOCKED_ADMIN"],
    })
      .notNull()
      .default("active"),
    balance: integer("balance").notNull().default(0),
    counter: integer("counter").notNull().default(0),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    notes: text("notes"),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.cardId] })],
);

export const sessionGrants = sqliteTable("session_grants", {
  grantId: text("grant_id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.tenantId),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId),
  deviceId: text("device_id").notNull(),
  keyVersion: integer("key_version").notNull(),
  allowedOps: text("allowed_ops").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  issuedAt: integer("issued_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.tenantId),
  cardId: blob("card_id").notNull(),
  counter: integer("counter").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull().default(0),
  balanceAfter: integer("balance_after").notNull(),
  timestamp: integer("timestamp").notNull(),
  hash: blob("hash").notNull(),
  terminalId: integer("terminal_id"),
  flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// --- New tables for enhanced tenant management ---

export const devices = sqliteTable(
  "devices",
  {
    deviceId: text("device_id").primaryKey().notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId),
    fingerprintHash: text("fingerprint_hash").notNull(),
    userAgent: text("user_agent").notNull(),
    platform: text("platform").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    blockedUntil: integer("blocked_until"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_devices_tenant_account").on(table.tenantId, table.accountId),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    sessionId: text("session_id").primaryKey().notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.accountId),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.deviceId),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_auth_sessions_device_id").on(table.deviceId),
    index("idx_auth_sessions_tenant_account").on(table.tenantId, table.accountId),
  ],
);

export const transactionLog = sqliteTable(
  "transaction_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId),
    cardId: text("card_id").notNull(),
    userId: integer("user_id"),
    counter: integer("counter").notNull(),
    type: text("type", {
      enum: ["debit", "credit", "checkin", "checkout", "topup", "admin"],
    }).notNull(),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    timestamp: integer("timestamp").notNull(),
    hash: text("hash").notNull(),
    terminalId: integer("terminal_id"),
    deviceId: text("device_id").references(() => devices.deviceId),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    flagged: integer("flagged").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("transaction_log_tenant_card_counter_unique").on(
      table.tenantId,
      table.cardId,
      table.counter,
    ),
    index("transaction_log_tenant_card_idx").on(table.tenantId, table.cardId),
    index("transaction_log_tenant_created_at_idx").on(table.tenantId, table.createdAt),
  ],
);

export const syncCursors = sqliteTable(
  "sync_cursors",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.deviceId),
    entityType: text("entity_type", {
      enum: ["members", "cards", "transactions"],
    }).notNull(),
    lastCursor: text("last_cursor").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.deviceId, table.entityType] }),
  ],
);

// --- Inferred TypeScript types ---

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;

export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;

export type TransactionLogEntry = typeof transactionLog.$inferSelect;
export type NewTransactionLogEntry = typeof transactionLog.$inferInsert;

export type SyncCursor = typeof syncCursors.$inferSelect;
export type NewSyncCursor = typeof syncCursors.$inferInsert;
