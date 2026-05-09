/**
 * Simulation Mode Banner
 *
 * Visible banner indicating simulation mode is active.
 * Includes toggle and custom timestamp input for admin users.
 *
 * Requirements: 13.1, 13.2
 */

import { cn } from '#/lib/utils.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'

interface SimulationBannerProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  simulatedTime: string
  onSimulatedTimeChange: (time: string) => void
  isAdmin: boolean
  className?: string
}

export function SimulationBanner({
  enabled,
  onToggle,
  simulatedTime,
  onSimulatedTimeChange,
  isAdmin,
  className,
}: SimulationBannerProps) {
  if (!isAdmin && !enabled) return null

  return (
    <div
      className={cn(
        'rounded-lg border-2 px-4 py-3',
        enabled
          ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'
          : 'border-border bg-card',
        className,
      )}
      role="alert"
      aria-live="polite"
      aria-label={
        enabled ? 'Simulation mode is active' : 'Simulation mode is inactive'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {enabled && (
            <span className="text-lg" aria-hidden="true">
              ⚠️
            </span>
          )}
          <span className="font-semibold">
            {enabled ? 'SIMULATION MODE ACTIVE' : 'Simulation Mode'}
          </span>
        </div>

        {isAdmin && (
          <Button
            variant={enabled ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => onToggle(!enabled)}
            aria-label={
              enabled
                ? 'Deactivate simulation mode'
                : 'Activate simulation mode'
            }
            className="min-h-[48px] min-w-[48px]"
          >
            {enabled ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </div>

      {enabled && isAdmin && (
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <Label
              htmlFor="sim-timestamp"
              className="mb-1 text-xs font-medium"
            >
              Custom Entry Timestamp
            </Label>
            <Input
              id="sim-timestamp"
              type="datetime-local"
              value={simulatedTime}
              onChange={(e) => onSimulatedTimeChange(e.target.value)}
              aria-label="Simulated entry timestamp"
              aria-describedby="sim-timestamp-desc"
              className="min-h-[48px]"
            />
            <p id="sim-timestamp-desc" className="mt-1 text-xs opacity-75">
              Set a past time to test multi-hour tariff calculations
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
