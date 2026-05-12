import { sqliteTable, integer, text, blob, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const tenants = sqliteTable('tenants', {
  tenantId: text('tenant_id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'suspended', 'archived'] }).notNull().default('active'),
  timezone: text('timezone').notNull().default('Asia/Jakarta'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const accounts = sqliteTable('accounts', {
  accountId: text('account_id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.tenantId),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'station', 'gate', 'terminal'] }).notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const users = sqliteTable('users', {
  tenantId: text('tenant_id').notNull().references(() => tenants.tenantId),
  userId: integer('user_id', { mode: 'number' }).notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [primaryKey({ columns: [t.tenantId, t.userId] })])

export const cards = sqliteTable('cards', {
  tenantId: text('tenant_id').notNull().references(() => tenants.tenantId),
  cardId: blob('card_id', { mode: 'buffer' }).notNull(),
  userId: integer('user_id', { mode: 'number' }),
  status: text('status', {
    enum: ['active', 'blocked_tamper', 'blocked_fraud', 'blocked_expired', 'blocked_admin'],
  }).notNull().default('active'),
  balance: integer('balance', { mode: 'number' }).notNull().default(0),
  counter: integer('counter', { mode: 'number' }).notNull().default(0),
  keyVersion: integer('key_version', { mode: 'number' }).notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  notes: text('notes'),
}, (t) => [primaryKey({ columns: [t.tenantId, t.cardId] })])

export const sessionGrants = sqliteTable('session_grants', {
  grantId: text('grant_id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.tenantId),
  accountId: text('account_id').notNull().references(() => accounts.accountId),
  deviceId: text('device_id').notNull(),
  keyVersion: integer('key_version', { mode: 'number' }).notNull(),
  allowedOps: text('allowed_ops').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  issuedAt: integer('issued_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const auditLog = sqliteTable('audit_log', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  tenantId: text('tenant_id').notNull().references(() => tenants.tenantId),
  cardId: blob('card_id', { mode: 'buffer' }).notNull(),
  counter: integer('counter', { mode: 'number' }).notNull(),
  type: text('type', { enum: ['debit', 'credit', 'checkin', 'checkout', 'admin'] }).notNull(),
  amount: integer('amount', { mode: 'number' }).notNull().default(0),
  balanceAfter: integer('balance_after', { mode: 'number' }).notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  hash: blob('hash', { mode: 'buffer' }).notNull(),
  terminalId: integer('terminal_id', { mode: 'number' }),
  flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})
