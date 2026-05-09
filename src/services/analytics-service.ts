/**
 * Analytics and Reporting Service
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 *
 * Provides daily aggregate computation, revenue reports, usage statistics,
 * member activity, terminal metrics, and dashboard summaries.
 */

import { and, eq, gte, lte, count, desc } from 'drizzle-orm'
import {
  transactions,
  dailyAggregates,
  terminals,
  memberApplications,
} from '#/db/schema.ts'
import type { db as DbType } from '#/db/index.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DateRange {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

export interface DailyAggregateRecord {
  id: string
  tenantId: string
  date: string
  totalCheckIns: number
  totalCheckOuts: number
  totalTopUps: number
  totalRevenue: number
  totalTopUpAmount: number
  uniqueMembers: number
  avgDurationHours: number
  computedAt: Date
}

export interface RevenueReport {
  dailyRevenue: Array<{
    date: string
    revenue: number
    topUpAmount: number
  }>
  totalRevenue: number
  totalTopUpAmount: number
}

export interface UsageStatistics {
  totalCheckIns: number
  totalCheckOuts: number
  totalTopUps: number
  activeMembers: number
  avgDurationHours: number
}

export interface MemberActivityReport {
  memberId: string
  transactions: Array<{
    id: string
    type: string
    amount: number
    balanceBefore: number
    balanceAfter: number
    occurredAt: Date
    terminalType: string
  }>
  totalSpending: number
  visitCount: number
  avgDurationHours: number
}

export interface TerminalMetricsReport {
  terminalId: string
  terminalName: string
  type: string
  totalTransactions: number
  transactionsPerDay: number
  lastHeartbeat: Date | null
  status: string
}

export interface DashboardSummary {
  todayRevenue: number
  activeCheckIns: number
  pendingApplications: number
  terminalHealth: {
    total: number
    active: number
    inactive: number
  }
  recentTransactions: Array<{
    id: string
    type: string
    amount: number
    memberId: string
    occurredAt: Date
  }>
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Compute daily aggregates from synced transactions for a tenant and date.
 * Requirement: 11.6
 *
 * Queries transactions grouped by tenant and date, computes aggregate metrics,
 * and upserts into the dailyAggregates table.
 * Excludes isSimulated=true transactions.
 *
 * @param tenantId - UUID of the tenant
 * @param date - Date string (YYYY-MM-DD)
 * @param database - Drizzle database instance
 * @returns The computed/updated daily aggregate record
 */
export async function computeDailyAggregate(
  tenantId: string,
  date: string,
  database: typeof DbType,
): Promise<DailyAggregateRecord> {
  // 1. Query transactions for the tenant on the given date, excluding simulated
  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd = new Date(`${date}T23:59:59.999Z`)

  const txRows = await database
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        gte(transactions.occurredAt, dayStart),
        lte(transactions.occurredAt, dayEnd),
        eq(transactions.isSimulated, false),
      ),
    )

  // 2. Compute aggregates
  let totalCheckIns = 0
  let totalCheckOuts = 0
  let totalTopUps = 0
  let totalRevenue = 0
  let totalTopUpAmount = 0
  let totalDurationHours = 0
  let durationCount = 0
  const uniqueMemberSet = new Set<string>()

  for (const tx of txRows) {
    uniqueMemberSet.add(tx.memberId)

    switch (tx.type) {
      case 'CHECKIN':
        totalCheckIns++
        break
      case 'EXIT':
        totalCheckOuts++
        totalRevenue += Math.abs(tx.amount)
        if (tx.durationHours != null) {
          totalDurationHours += tx.durationHours
          durationCount++
        }
        break
      case 'TOPUP':
        totalTopUps++
        totalTopUpAmount += tx.amount
        break
    }
  }

  const avgDurationHours = durationCount > 0
    ? Math.round((totalDurationHours / durationCount) * 100) / 100
    : 0

  // 3. Upsert into dailyAggregates
  // Check if record exists
  const [existing] = await database
    .select({ id: dailyAggregates.id })
    .from(dailyAggregates)
    .where(
      and(
        eq(dailyAggregates.tenantId, tenantId),
        eq(dailyAggregates.date, date),
      ),
    )
    .limit(1)

  if (existing) {
    // Update existing record
    const [updated] = await database
      .update(dailyAggregates)
      .set({
        totalCheckIns,
        totalCheckOuts,
        totalTopUps,
        totalRevenue,
        totalTopUpAmount,
        uniqueMembers: uniqueMemberSet.size,
        avgDurationHours,
        computedAt: new Date(),
      })
      .where(eq(dailyAggregates.id, existing.id))
      .returning()

    return updated as DailyAggregateRecord
  }

  // Insert new record
  const [inserted] = await database
    .insert(dailyAggregates)
    .values({
      tenantId,
      date,
      totalCheckIns,
      totalCheckOuts,
      totalTopUps,
      totalRevenue,
      totalTopUpAmount,
      uniqueMembers: uniqueMemberSet.size,
      avgDurationHours,
    })
    .returning()

  if (!inserted) {
    throw new Error('Failed to create daily aggregate record')
  }

  return inserted as DailyAggregateRecord
}

/**
 * Get revenue report for a date range from DailyAggregate records.
 * Requirement: 11.1
 *
 * @param tenantId - UUID of the tenant
 * @param dateRange - Start and end dates
 * @param database - Drizzle database instance
 * @returns Revenue report with daily breakdown and totals
 */
export async function getRevenueReport(
  tenantId: string,
  dateRange: DateRange,
  database: typeof DbType,
): Promise<RevenueReport> {
  const rows = await database
    .select()
    .from(dailyAggregates)
    .where(
      and(
        eq(dailyAggregates.tenantId, tenantId),
        gte(dailyAggregates.date, dateRange.startDate),
        lte(dailyAggregates.date, dateRange.endDate),
      ),
    )
    .orderBy(dailyAggregates.date)

  let totalRevenue = 0
  let totalTopUpAmount = 0

  const dailyRevenue = rows.map((row) => {
    totalRevenue += row.totalRevenue
    totalTopUpAmount += row.totalTopUpAmount
    return {
      date: row.date,
      revenue: row.totalRevenue,
      topUpAmount: row.totalTopUpAmount,
    }
  })

  return {
    dailyRevenue,
    totalRevenue,
    totalTopUpAmount,
  }
}

/**
 * Get usage statistics for a date range.
 * Requirement: 11.2
 *
 * @param tenantId - UUID of the tenant
 * @param dateRange - Start and end dates
 * @param database - Drizzle database instance
 * @returns Usage statistics (check-ins, check-outs, top-ups, active members, avg duration)
 */
export async function getUsageStatistics(
  tenantId: string,
  dateRange: DateRange,
  database: typeof DbType,
): Promise<UsageStatistics> {
  const rows = await database
    .select()
    .from(dailyAggregates)
    .where(
      and(
        eq(dailyAggregates.tenantId, tenantId),
        gte(dailyAggregates.date, dateRange.startDate),
        lte(dailyAggregates.date, dateRange.endDate),
      ),
    )

  let totalCheckIns = 0
  let totalCheckOuts = 0
  let totalTopUps = 0
  let totalDuration = 0
  let durationDays = 0
  const memberSet = new Set<number>()

  for (const row of rows) {
    totalCheckIns += row.totalCheckIns
    totalCheckOuts += row.totalCheckOuts
    totalTopUps += row.totalTopUps
    if (row.avgDurationHours > 0) {
      totalDuration += row.avgDurationHours
      durationDays++
    }
    memberSet.add(row.uniqueMembers)
  }

  // Sum unique members across days (approximation from daily aggregates)
  let activeMembers = 0
  for (const m of memberSet) {
    activeMembers = Math.max(activeMembers, m)
  }

  const avgDurationHours = durationDays > 0
    ? Math.round((totalDuration / durationDays) * 100) / 100
    : 0

  return {
    totalCheckIns,
    totalCheckOuts,
    totalTopUps,
    activeMembers,
    avgDurationHours,
  }
}

/**
 * Get a member's activity report including transaction history, spending, and visit frequency.
 * Requirement: 11.3
 *
 * @param tenantId - UUID of the tenant
 * @param memberId - Member ID (e.g., "MBC-8829")
 * @param dateRange - Start and end dates
 * @param database - Drizzle database instance
 * @returns Member activity report
 */
export async function getMemberActivity(
  tenantId: string,
  memberId: string,
  dateRange: DateRange,
  database: typeof DbType,
): Promise<MemberActivityReport> {
  const startDate = new Date(`${dateRange.startDate}T00:00:00.000Z`)
  const endDate = new Date(`${dateRange.endDate}T23:59:59.999Z`)

  const txRows = await database
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        eq(transactions.memberId, memberId),
        gte(transactions.occurredAt, startDate),
        lte(transactions.occurredAt, endDate),
        eq(transactions.isSimulated, false),
      ),
    )
    .orderBy(desc(transactions.occurredAt))

  let totalSpending = 0
  let visitCount = 0
  let totalDuration = 0
  let durationCount = 0

  const txList = txRows.map((tx) => {
    if (tx.type === 'EXIT') {
      totalSpending += Math.abs(tx.amount)
      if (tx.durationHours != null) {
        totalDuration += tx.durationHours
        durationCount++
      }
    }
    if (tx.type === 'CHECKIN') {
      visitCount++
    }
    return {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      occurredAt: tx.occurredAt,
      terminalType: tx.terminalType,
    }
  })

  const avgDurationHours = durationCount > 0
    ? Math.round((totalDuration / durationCount) * 100) / 100
    : 0

  return {
    memberId,
    transactions: txList,
    totalSpending,
    visitCount,
    avgDurationHours,
  }
}

/**
 * Get per-terminal metrics including throughput and uptime.
 * Requirement: 11.4
 *
 * @param tenantId - UUID of the tenant
 * @param terminalId - UUID of the terminal
 * @param dateRange - Start and end dates
 * @param database - Drizzle database instance
 * @returns Terminal metrics report
 */
export async function getTerminalMetrics(
  tenantId: string,
  terminalId: string,
  dateRange: DateRange,
  database: typeof DbType,
): Promise<TerminalMetricsReport> {
  // 1. Get terminal info
  const [terminal] = await database
    .select()
    .from(terminals)
    .where(
      and(
        eq(terminals.id, terminalId),
        eq(terminals.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (!terminal) {
    throw new Error(`Terminal "${terminalId}" not found for tenant "${tenantId}"`)
  }

  // 2. Count transactions for this terminal in the date range
  const startDate = new Date(`${dateRange.startDate}T00:00:00.000Z`)
  const endDate = new Date(`${dateRange.endDate}T23:59:59.999Z`)

  const txRows = await database
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.terminalId, terminalId),
        eq(transactions.tenantId, tenantId),
        gte(transactions.occurredAt, startDate),
        lte(transactions.occurredAt, endDate),
        eq(transactions.isSimulated, false),
      ),
    )

  const totalTransactions = txRows.length

  // 3. Calculate transactions per day
  const start = new Date(dateRange.startDate)
  const end = new Date(dateRange.endDate)
  const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const transactionsPerDay = Math.round((totalTransactions / daysDiff) * 100) / 100

  return {
    terminalId: terminal.id,
    terminalName: terminal.name,
    type: terminal.type,
    totalTransactions,
    transactionsPerDay,
    lastHeartbeat: terminal.lastHeartbeat,
    status: terminal.status,
  }
}

/**
 * Get dashboard summary for a tenant.
 * Requirement: 11.5
 *
 * Returns today's revenue, active check-ins, pending applications,
 * terminal health, and recent transactions.
 *
 * @param tenantId - UUID of the tenant
 * @param database - Drizzle database instance
 * @returns Dashboard summary
 */
export async function getDashboardSummary(
  tenantId: string,
  database: typeof DbType,
): Promise<DashboardSummary> {
  const today = new Date().toISOString().split('T')[0]!

  // 1. Today's revenue from daily aggregates
  const [todayAggregate] = await database
    .select()
    .from(dailyAggregates)
    .where(
      and(
        eq(dailyAggregates.tenantId, tenantId),
        eq(dailyAggregates.date, today),
      ),
    )
    .limit(1)

  const todayRevenue = todayAggregate?.totalRevenue ?? 0

  // 2. Active check-ins: count transactions with type CHECKIN that don't have a matching EXIT today
  // Simplified: count today's check-ins from aggregate
  const activeCheckIns = todayAggregate
    ? todayAggregate.totalCheckIns - todayAggregate.totalCheckOuts
    : 0

  // 3. Pending applications count
  const pendingResult = await database
    .select({ count: count() })
    .from(memberApplications)
    .where(
      and(
        eq(memberApplications.tenantId, tenantId),
        eq(memberApplications.status, 'pending'),
      ),
    )

  const pendingApplications = pendingResult[0]?.count ?? 0

  // 4. Terminal health
  const allTerminals = await database
    .select({ status: terminals.status })
    .from(terminals)
    .where(eq(terminals.tenantId, tenantId))

  const terminalHealth = {
    total: allTerminals.length,
    active: allTerminals.filter((t) => t.status === 'active').length,
    inactive: allTerminals.filter((t) => t.status !== 'active').length,
  }

  // 5. Recent transactions (last 10)
  const todayStart = new Date(`${today}T00:00:00.000Z`)
  const recentTxRows = await database
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      memberId: transactions.memberId,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        gte(transactions.occurredAt, todayStart),
        eq(transactions.isSimulated, false),
      ),
    )
    .orderBy(desc(transactions.occurredAt))
    .limit(10)

  return {
    todayRevenue,
    activeCheckIns: Math.max(0, activeCheckIns),
    pendingApplications,
    terminalHealth,
    recentTransactions: recentTxRows,
  }
}
