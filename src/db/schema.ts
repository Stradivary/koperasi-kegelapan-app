import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  date,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum('tenant_status', [
  'active',
  'suspended',
  'deactivated',
])

export const encryptionKeyStatusEnum = pgEnum('encryption_key_status', [
  'active',
  'rotating',
  'retired',
])

export const applicationStatusEnum = pgEnum('application_status', [
  'pending',
  'approved',
  'rejected',
])

export const cardStatusEnum = pgEnum('card_status', [
  'unissued',
  'active',
  'suspended',
  'revoked',
])

export const transactionTypeEnum = pgEnum('transaction_type', [
  'CHECKIN',
  'EXIT',
  'TOPUP',
])

export const topUpSourceEnum = pgEnum('top_up_source', [
  'cash',
  'bank_transfer',
  'e_wallet',
  'other',
])

export const terminalTypeEnum = pgEnum('terminal_type', [
  'gate',
  'terminal',
  'station',
  'scout',
])

export const terminalStatusEnum = pgEnum('terminal_status', [
  'active',
  'inactive',
  'maintenance',
])

export const adminRoleEnum = pgEnum('admin_role', [
  'super_admin',
  'tenant_admin',
  'operator',
])

export const adminStatusEnum = pgEnum('admin_status', ['active', 'suspended'])

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * Tenants table — each cooperative is a tenant.
 * Requirement 1.1, 1.2
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    name: text().notNull(),
    encryptionKeyId: text('encryption_key_id'),
    tariffRatePerHour: integer('tariff_rate_per_hour').notNull().default(2000),
    maxBalance: integer('max_balance').notNull().default(10_000_000),
    minBalanceForEntry: integer('min_balance_for_entry').notNull().default(2000),
    branding: jsonb().$type<{
      primaryColor: string
      logoUrl: string | null
      displayName: string
    }>(),
    status: tenantStatusEnum().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('tenants_slug_idx').on(table.slug)],
)

/**
 * Encryption keys table — tenant-specific AES-GCM keys.
 * Requirement 7.4
 */
export const encryptionKeys = pgTable('encryption_keys', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  keyMaterial: text('key_material').notNull(),
  version: integer().notNull(),
  status: encryptionKeyStatusEnum().notNull().default('active'),
  activatedAt: timestamp('activated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  migrationDeadline: timestamp('migration_deadline', { withTimezone: true }),
})

/**
 * Member applications table — self-registration submissions.
 * Requirements 2.1, 2.2
 */
export const memberApplications = pgTable(
  'member_applications',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    fullName: text('full_name').notNull(),
    identityNumber: text('identity_number').notNull(),
    phone: text().notNull(),
    email: text(),
    address: text().notNull(),
    status: applicationStatusEnum().notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
  },
  (table) => [
    uniqueIndex('member_applications_tenant_identity_idx').on(
      table.tenantId,
      table.identityNumber,
    ),
  ],
)

/**
 * Members table — approved members with card assignments.
 * Requirements 2.3, 3.2
 */
export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    memberId: text('member_id').notNull(),
    applicationId: uuid('application_id').notNull(),
    fullName: text('full_name').notNull(),
    identityNumber: text('identity_number').notNull(),
    phone: text().notNull(),
    email: text(),
    cardUid: text('card_uid'),
    cardStatus: cardStatusEnum('card_status').notNull().default('unissued'),
    registeredAt: timestamp('registered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('members_card_uid_idx').on(table.cardUid),
    uniqueIndex('members_tenant_identity_idx').on(
      table.tenantId,
      table.identityNumber,
    ),
  ],
)

/**
 * Transactions table — server-side record of all card operations.
 * Requirements 9.2, 13.3
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    memberId: text('member_id').notNull(),
    terminalId: uuid('terminal_id').notNull(),
    type: transactionTypeEnum().notNull(),
    amount: integer().notNull(),
    balanceBefore: integer('balance_before').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    topUpSource: topUpSourceEnum('top_up_source'),
    entryTime: timestamp('entry_time', { withTimezone: true }),
    exitTime: timestamp('exit_time', { withTimezone: true }),
    durationHours: real('duration_hours'),
    syncedAt: timestamp('synced_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    terminalType: terminalTypeEnum('terminal_type').notNull(),
    isSimulated: boolean('is_simulated').notNull().default(false),
  },
  (table) => [
    index('transactions_tenant_occurred_idx').on(
      table.tenantId,
      table.occurredAt,
    ),
    index('transactions_tenant_member_idx').on(
      table.tenantId,
      table.memberId,
    ),
  ],
)

/**
 * Terminals table — physical terminal devices.
 * Requirement 10.1
 */
export const terminals = pgTable('terminals', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text().notNull(),
  type: terminalTypeEnum().notNull(),
  location: text(),
  status: terminalStatusEnum().notNull().default('active'),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  registeredAt: timestamp('registered_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  registeredBy: text('registered_by').notNull(),
})

/**
 * Admin users table — dashboard and terminal operators.
 * Requirements 12.1, 12.3
 */
export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    email: text().notNull(),
    name: text().notNull(),
    role: adminRoleEnum().notNull(),
    status: adminStatusEnum().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('admin_users_email_idx').on(table.email)],
)

/**
 * Daily aggregates table — pre-computed analytics per tenant per date.
 * Requirement 11.6
 */
export const dailyAggregates = pgTable(
  'daily_aggregates',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    date: date().notNull(),
    totalCheckIns: integer('total_check_ins').notNull().default(0),
    totalCheckOuts: integer('total_check_outs').notNull().default(0),
    totalTopUps: integer('total_top_ups').notNull().default(0),
    totalRevenue: integer('total_revenue').notNull().default(0),
    totalTopUpAmount: integer('total_top_up_amount').notNull().default(0),
    uniqueMembers: integer('unique_members').notNull().default(0),
    avgDurationHours: real('avg_duration_hours').notNull().default(0),
    computedAt: timestamp('computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('daily_aggregates_tenant_date_idx').on(
      table.tenantId,
      table.date,
    ),
  ],
)
