import { sql } from "drizzle-orm";
import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
