/**
 * Terminal Status Indicator
 *
 * Large, full-screen status display for terminal UIs.
 * Color-coded backgrounds following Signal UI design:
 * - Ready: green
 * - Tap Now: blue
 * - Processing: blue (animated)
 * - Success: green
 * - Error: red
 *
 * Requirements: 16.1, 16.2
 */

import { cn } from '#/lib/utils.ts'

export type TerminalStatus =
  | 'ready'
  | 'tap-now'
  | 'processing'
  | 'success'
  | 'error'

interface StatusIndicatorProps {
  status: TerminalStatus
  message?: string
  submessage?: string
  className?: string
}

/**
 * Status configuration with WCAG AA compliant color combinations.
 * All backgrounds use solid colors with white text for high contrast (>= 4.5:1 ratio).
 */
const STATUS_CONFIG: Record<
  TerminalStatus,
  { label: string; bg: string; text: string; icon: string }
> = {
  ready: {
    label: 'Ready',
    bg: 'bg-emerald-700',
    text: 'text-white',
    icon: '✓',
  },
  'tap-now': {
    label: 'Tap Now',
    bg: 'bg-blue-700',
    text: 'text-white',
    icon: '📱',
  },
  processing: {
    label: 'Processing',
    bg: 'bg-blue-800',
    text: 'text-white',
    icon: '⏳',
  },
  success: {
    label: 'Success',
    bg: 'bg-emerald-700',
    text: 'text-white',
    icon: '✅',
  },
  error: {
    label: 'Error',
    bg: 'bg-red-700',
    text: 'text-white',
    icon: '❌',
  },
}

export function StatusIndicator({
  status,
  message,
  submessage,
  className,
}: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status]

  return (
    <div
      className={cn(
        'flex min-h-[60vh] flex-col items-center justify-center rounded-2xl p-8',
        config.bg,
        config.text,
        status === 'processing' && 'animate-pulse',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Terminal status: ${config.label}${message ? `. ${message}` : ''}`}
    >
      <span className="mb-4 text-6xl" aria-hidden="true">
        {config.icon}
      </span>
      <h1 className="mb-2 text-4xl font-bold tracking-tight sm:text-6xl">
        {config.label}
      </h1>
      {message && (
        <p className="mt-2 max-w-md text-center text-lg opacity-90 sm:text-xl">
          {message}
        </p>
      )}
      {submessage && (
        <p className="mt-1 max-w-md text-center text-sm opacity-75">
          {submessage}
        </p>
      )}
    </div>
  )
}
