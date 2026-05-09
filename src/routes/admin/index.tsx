/**
 * Admin Dashboard — Summary View
 *
 * Displays today's revenue, active check-ins, pending applications,
 * terminal health, and recent transactions.
 *
 * Requirements: 11.5, 16.1
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AdminLayout } from '#/components/admin/index.ts'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboardPage,
})

// Mock data for initial UI — will be replaced with server function calls
const MOCK_SUMMARY = {
  todayRevenue: 450000,
  activeCheckIns: 12,
  pendingApplications: 3,
  terminalHealth: { total: 8, active: 7, inactive: 1 },
  recentTransactions: [
    { id: '1', type: 'CHECKIN', amount: 0, memberId: 'MBC-1001', occurredAt: new Date() },
    { id: '2', type: 'EXIT', amount: -4000, memberId: 'MBC-1002', occurredAt: new Date() },
    { id: '3', type: 'TOPUP', amount: 50000, memberId: 'MBC-1003', occurredAt: new Date() },
    { id: '4', type: 'EXIT', amount: -6000, memberId: 'MBC-1004', occurredAt: new Date() },
    { id: '5', type: 'CHECKIN', amount: 0, memberId: 'MBC-1005', occurredAt: new Date() },
  ],
}

function formatCurrency(amount: number): string {
  return `Rp ${Math.abs(amount).toLocaleString('id-ID')}`
}

function AdminDashboardPage() {
  const [summary] = useState(MOCK_SUMMARY)

  return (
    <AdminLayout activePage="dashboard">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Today's Revenue"
            value={formatCurrency(summary.todayRevenue)}
            description="From tariff deductions"
          />
          <SummaryCard
            title="Active Check-Ins"
            value={String(summary.activeCheckIns)}
            description="Members currently inside"
          />
          <SummaryCard
            title="Pending Applications"
            value={String(summary.pendingApplications)}
            description="Awaiting review"
          />
          <SummaryCard
            title="Terminal Health"
            value={`${summary.terminalHealth.active}/${summary.terminalHealth.total}`}
            description={`${summary.terminalHealth.inactive} inactive`}
          />
        </div>

        {/* Recent Transactions */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Transactions</h3>
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              role="table"
              aria-label="Recent transactions"
            >
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">
                    Member
                  </th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="pb-2 font-medium text-muted-foreground">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.recentTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          tx.type === 'CHECKIN'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : tx.type === 'EXIT'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-medium">{tx.memberId}</td>
                    <td className="py-2 pr-4">
                      {tx.amount === 0
                        ? '—'
                        : tx.amount > 0
                          ? `+${formatCurrency(tx.amount)}`
                          : `-${formatCurrency(tx.amount)}`}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {tx.occurredAt.toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      role="region"
      aria-label={title}
    >
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
