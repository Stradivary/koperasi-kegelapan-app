/**
 * Admin — Revenue and Usage Analytics
 *
 * Date range selectors and chart visualizations for revenue and usage.
 *
 * Requirements: 11.1, 11.2
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AdminLayout } from '#/components/admin/index.ts'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Button } from '#/components/ui/button.tsx'

export const Route = createFileRoute('/admin/analytics')({
  component: AnalyticsPage,
})

// Mock data
const MOCK_REVENUE = [
  { date: '2025-01-20', revenue: 120000, topUpAmount: 500000 },
  { date: '2025-01-21', revenue: 180000, topUpAmount: 350000 },
  { date: '2025-01-22', revenue: 95000, topUpAmount: 200000 },
  { date: '2025-01-23', revenue: 210000, topUpAmount: 600000 },
  { date: '2025-01-24', revenue: 150000, topUpAmount: 450000 },
  { date: '2025-01-25', revenue: 280000, topUpAmount: 300000 },
  { date: '2025-01-26', revenue: 190000, topUpAmount: 550000 },
]

const MOCK_USAGE = {
  totalCheckIns: 342,
  totalCheckOuts: 338,
  totalTopUps: 89,
  activeMembers: 156,
  avgDurationHours: 2.4,
}

function formatCurrency(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`
}

function AnalyticsPage() {
  const [startDate, setStartDate] = useState('2025-01-20')
  const [endDate, setEndDate] = useState('2025-01-26')
  const [revenue] = useState(MOCK_REVENUE)
  const [usage] = useState(MOCK_USAGE)

  const totalRevenue = revenue.reduce((sum, r) => sum + r.revenue, 0)
  const totalTopUp = revenue.reduce((sum, r) => sum + r.topUpAmount, 0)
  const maxRevenue = Math.max(...revenue.map((r) => r.revenue))

  return (
    <AdminLayout activePage="analytics">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Analytics</h2>

        {/* Date Range Selector */}
        <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <Label htmlFor="analytics-start" className="mb-1">
              Start Date
            </Label>
            <Input
              id="analytics-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
              className="min-h-[48px]"
            />
          </div>
          <div>
            <Label htmlFor="analytics-end" className="mb-1">
              End Date
            </Label>
            <Input
              id="analytics-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End date"
              className="min-h-[48px]"
            />
          </div>
          <Button
            aria-label="Apply date range filter"
            className="min-h-[48px]"
          >
            Apply
          </Button>
        </div>

        {/* Usage Statistics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Check-Ins" value={String(usage.totalCheckIns)} />
          <StatCard label="Check-Outs" value={String(usage.totalCheckOuts)} />
          <StatCard label="Top-Ups" value={String(usage.totalTopUps)} />
          <StatCard
            label="Active Members"
            value={String(usage.activeMembers)}
          />
          <StatCard
            label="Avg Duration"
            value={`${usage.avgDurationHours}h`}
          />
        </div>

        {/* Revenue Summary */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="mt-1 text-3xl font-bold">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              From tariff deductions
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Top-Ups</p>
            <p className="mt-1 text-3xl font-bold">
              {formatCurrency(totalTopUp)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Member deposits
            </p>
          </div>
        </div>

        {/* Revenue Chart (simple bar chart) */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Daily Revenue</h3>
          <div
            className="flex items-end gap-2"
            role="img"
            aria-label={`Daily revenue chart from ${startDate} to ${endDate}`}
          >
            {revenue.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center">
                <div
                  className="w-full rounded-t bg-primary"
                  style={{
                    height: `${Math.max(4, (day.revenue / maxRevenue) * 200)}px`,
                  }}
                  aria-label={`${day.date}: ${formatCurrency(day.revenue)}`}
                />
                <span className="mt-2 text-xs text-muted-foreground">
                  {day.date.slice(5)}
                </span>
                <span className="text-xs font-medium">
                  {formatCurrency(day.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      role="region"
      aria-label={label}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  )
}
