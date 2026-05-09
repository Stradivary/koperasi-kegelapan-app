/**
 * Admin — Member Activity Detail Page
 *
 * Transaction history and spending patterns for a specific member.
 *
 * Requirements: 11.3
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AdminLayout } from '#/components/admin/index.ts'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Button } from '#/components/ui/button.tsx'

export const Route = createFileRoute('/admin/members_/activity')({
  component: MemberActivityPage,
})

// Mock data
const MOCK_ACTIVITY = {
  memberId: 'MBC-1001',
  fullName: 'Ahmad Suryadi',
  totalSpending: 156000,
  visitCount: 42,
  avgDurationHours: 2.8,
  transactions: [
    { id: '1', type: 'EXIT', amount: -4000, balanceBefore: 50000, balanceAfter: 46000, occurredAt: new Date(), terminalType: 'terminal' },
    { id: '2', type: 'CHECKIN', amount: 0, balanceBefore: 46000, balanceAfter: 46000, occurredAt: new Date(Date.now() - 7200000), terminalType: 'gate' },
    { id: '3', type: 'TOPUP', amount: 50000, balanceBefore: 0, balanceAfter: 50000, occurredAt: new Date(Date.now() - 86400000), terminalType: 'station' },
    { id: '4', type: 'EXIT', amount: -6000, balanceBefore: 56000, balanceAfter: 50000, occurredAt: new Date(Date.now() - 172800000), terminalType: 'terminal' },
    { id: '5', type: 'CHECKIN', amount: 0, balanceBefore: 56000, balanceAfter: 56000, occurredAt: new Date(Date.now() - 180000000), terminalType: 'gate' },
  ],
}

function formatCurrency(amount: number): string {
  return `Rp ${Math.abs(amount).toLocaleString('id-ID')}`
}

function MemberActivityPage() {
  const [memberId, setMemberId] = useState('MBC-1001')
  const [activity] = useState(MOCK_ACTIVITY)

  return (
    <AdminLayout activePage="members">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Member Activity</h2>

        {/* Member Lookup */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Label htmlFor="activity-member" className="mb-1">
              Member ID
            </Label>
            <Input
              id="activity-member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="Enter member ID (e.g., MBC-1001)"
              aria-label="Member ID to view activity"
              className="min-h-[48px]"
            />
          </div>
          <Button aria-label="Load member activity" className="min-h-[48px]">
            Load
          </Button>
        </div>

        {/* Member Summary */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-1 text-lg font-bold">{activity.fullName}</h3>
          <p className="text-sm text-muted-foreground">
            {activity.memberId}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Spending</p>
              <p className="text-xl font-bold">
                {formatCurrency(activity.totalSpending)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Visits</p>
              <p className="text-xl font-bold">{activity.visitCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Duration</p>
              <p className="text-xl font-bold">
                {activity.avgDurationHours}h
              </p>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h3 className="text-lg font-semibold">Transaction History</h3>
          </div>
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              role="table"
              aria-label="Member transaction history"
            >
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="p-3 font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="p-3 font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="p-3 font-medium text-muted-foreground">
                    Balance
                  </th>
                  <th className="p-3 font-medium text-muted-foreground">
                    Terminal
                  </th>
                  <th className="p-3 font-medium text-muted-foreground">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-border/50"
                  >
                    <td className="p-3">
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
                    <td className="p-3">
                      {tx.amount === 0
                        ? '—'
                        : tx.amount > 0
                          ? `+${formatCurrency(tx.amount)}`
                          : `-${formatCurrency(tx.amount)}`}
                    </td>
                    <td className="p-3">
                      {formatCurrency(tx.balanceBefore)} →{' '}
                      {formatCurrency(tx.balanceAfter)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {tx.terminalType}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {tx.occurredAt.toLocaleString()}
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
