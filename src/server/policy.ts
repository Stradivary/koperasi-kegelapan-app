export interface PolicyData {
  tenantId: string
  maxTransactionAmount: number
  maxDailyTotal: number
  topupOnlineOnly: boolean
  allowedTxTypes: string[]
  sessionTimeoutHours: number
}

const DEFAULT_POLICY: Omit<PolicyData, 'tenantId'> = {
  maxTransactionAmount: 1_000_000,
  maxDailyTotal: 5_000_000,
  topupOnlineOnly: true,
  allowedTxTypes: ['debit', 'credit', 'checkin', 'checkout'],
  sessionTimeoutHours: 24,
}

export function getDefaultPolicy(tenantId: string): PolicyData {
  return { ...DEFAULT_POLICY, tenantId }
}
