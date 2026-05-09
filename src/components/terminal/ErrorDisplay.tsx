/**
 * Error Display Component
 *
 * Shows error messages with recovery instructions.
 * Maps machine-readable error codes to user-friendly messages.
 *
 * Requirements: 16.1
 */

import { cn } from '#/lib/utils.ts'
import { Button } from '#/components/ui/button.tsx'

interface ErrorDisplayProps {
  code: string
  message: string
  onDismiss?: () => void
  className?: string
}

const RECOVERY_INSTRUCTIONS: Record<string, string> = {
  ALREADY_CHECKED_IN:
    'Member must tap out at The Terminal first, or an operator can reset the card at The Station.',
  NOT_CHECKED_IN: 'Member needs to check in at The Gate first.',
  INSUFFICIENT_BALANCE_ENTRY:
    'Member must top up at The Station or The Scout before entering.',
  INSUFFICIENT_BALANCE_EXIT:
    'Member must top up at The Station or The Scout before exiting.',
  TENANT_MISMATCH:
    'Member must use a terminal belonging to their cooperative.',
  HMAC_VERIFICATION_FAILED:
    'Card must be brought to The Station for admin inspection. Admin can re-issue the card.',
  DECRYPTION_FAILED:
    'Card must be brought to The Station for admin inspection.',
  BALANCE_OVERFLOW:
    'Try a smaller top-up amount that stays within the balance limit.',
  NFC_WRITE_ERROR:
    'Please retry the operation. The card was not modified.',
  NFC_CARD_REMOVED:
    'Keep the card steady on the reader and retry the operation.',
  NFC_NOT_SUPPORTED:
    'This device does not support NFC. Use a compatible Android device with Chrome.',
  NFC_PERMISSION_DENIED:
    'Allow NFC access in your browser settings and try again.',
  SCHEMA_MIGRATION_FAILED:
    'Card requires update. Please visit The Station.',
  INVALID_CARD_DATA:
    'Card data is corrupted. Please visit The Station for re-issuance.',
  INVALID_AMOUNT: 'Enter a valid positive amount.',
}

export function ErrorDisplay({
  code,
  message,
  onDismiss,
  className,
}: ErrorDisplayProps) {
  const recovery = RECOVERY_INSTRUCTIONS[code]

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-red-500 bg-red-50 p-6 text-red-900 dark:bg-red-950 dark:text-red-100',
        className,
      )}
      role="alert"
      aria-live="assertive"
      aria-label={`Error: ${message}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl" aria-hidden="true">
          ❌
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-bold">Error</h3>
          <p className="mt-1 text-base">{message}</p>
          {recovery && (
            <p
              className="mt-2 text-sm opacity-80"
              aria-describedby="error-recovery"
            >
              <strong>How to fix:</strong> {recovery}
            </p>
          )}
        </div>
      </div>
      {onDismiss && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="min-h-[48px] min-w-[48px] border-red-300 text-red-900 hover:bg-red-100 dark:border-red-700 dark:text-red-100 dark:hover:bg-red-900"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}
