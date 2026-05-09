/**
 * NFC Card Operations — Tariff Calculation
 *
 * Ceiling-based hourly tariff calculation for check-out operations.
 * Duration is always rounded up to the nearest whole hour.
 *
 * Requirement: 5.4
 */

/**
 * Calculate the tariff for a stay based on entry and exit times.
 *
 * Uses ceiling division: any partial hour is charged as a full hour.
 * Formula: ceil(durationSeconds / 3600) * ratePerHour
 *
 * @param entryTime - Unix timestamp (seconds) of check-in
 * @param exitTime - Unix timestamp (seconds) of check-out
 * @param ratePerHour - Tariff rate per hour in Rupiah
 * @returns Tariff amount in Rupiah
 * @throws Error if exitTime <= entryTime or ratePerHour <= 0
 */
export function calculateTariff(
  entryTime: number,
  exitTime: number,
  ratePerHour: number,
): number {
  if (exitTime <= entryTime) {
    throw new Error('Exit time must be after entry time')
  }
  if (ratePerHour <= 0) {
    throw new Error('Rate per hour must be positive')
  }

  const durationSeconds = exitTime - entryTime
  const hours = Math.ceil(durationSeconds / 3600)
  return hours * ratePerHour
}
