/**
 * Tariff Breakdown Display
 *
 * Shows tariff calculation details after a check-out:
 * entry time, exit time, duration, rate, and total charge.
 *
 * Requirements: 5.4
 */

import { cn } from '#/lib/utils.ts'

interface TariffBreakdownProps {
  entryTime: number
  exitTime: number
  durationHours: number
  ratePerHour: number
  totalCharge: number
  balanceBefore: number
  balanceAfter: number
  className?: string
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString()
}

function formatCurrency(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`
}

export function TariffBreakdown({
  entryTime,
  exitTime,
  durationHours,
  ratePerHour,
  totalCharge,
  balanceBefore,
  balanceAfter,
  className,
}: TariffBreakdownProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-6',
        className,
      )}
      role="region"
      aria-label="Tariff breakdown"
    >
      <h3 className="mb-4 text-lg font-bold">Tariff Breakdown</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Entry Time</dt>
          <dd className="font-medium">{formatTime(entryTime)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Exit Time</dt>
          <dd className="font-medium">{formatTime(exitTime)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-medium">
            {durationHours} hour{durationHours !== 1 ? 's' : ''} (rounded up)
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Rate</dt>
          <dd className="font-medium">{formatCurrency(ratePerHour)}/hour</dd>
        </div>
        <div className="my-2 border-t border-border" />
        <div className="flex justify-between text-base font-bold">
          <dt>Total Charge</dt>
          <dd>{formatCurrency(totalCharge)}</dd>
        </div>
        <div className="my-2 border-t border-border" />
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Balance Before</dt>
          <dd className="font-medium">{formatCurrency(balanceBefore)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Balance After</dt>
          <dd className="font-bold text-emerald-600">{formatCurrency(balanceAfter)}</dd>
        </div>
      </dl>
    </div>
  )
}
