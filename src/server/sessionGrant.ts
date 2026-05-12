import { randomBytes, createHmac } from 'node:crypto'
import { nowSeconds } from './auth'

const SESSION_KEY_LIFETIME_SECONDS = 24 * 60 * 60

export interface GrantPayload {
  keyVersion: number
  sessionKey: string
  expiresAt: number
  allowedOps: string[]
  tenantId: string
  accountId: string
  deviceId: string
}

const MASTER_KEY = Buffer.from(
  process.env.SESSION_MASTER_KEY ?? 'dev-insecure-master-key-change-in-prod-32b',
  'utf8',
).slice(0, 32)

function deriveTenantKey(tenantId: string, keyVersion: number): Buffer {
  return createHmac('sha256', MASTER_KEY)
    .update(`${tenantId}:${keyVersion}`)
    .digest()
}

export function issueSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string,
  keyVersion = 1,
): GrantPayload & { signature: string } {
  const sessionKey = randomBytes(32)
  const expiresAt = nowSeconds() + SESSION_KEY_LIFETIME_SECONDS

  const allowedOps = roleToOps(role)

  const payload: GrantPayload = {
    keyVersion,
    sessionKey: sessionKey.toString('base64'),
    expiresAt,
    allowedOps,
    tenantId,
    accountId,
    deviceId,
  }

  const tenantKey = deriveTenantKey(tenantId, keyVersion)
  const signature = createHmac('sha256', tenantKey)
    .update(JSON.stringify({ keyVersion, expiresAt, allowedOps, accountId, deviceId }))
    .digest('base64url')

  return { ...payload, signature }
}

function roleToOps(role: string): string[] {
  switch (role) {
    case 'terminal':
      return ['read', 'debit']
    case 'gate':
      return ['read', 'checkin', 'checkout']
    case 'station':
      return ['read', 'credit', 'checkin', 'checkout', 'admin']
    case 'admin':
      return ['read', 'debit', 'credit', 'checkin', 'checkout', 'admin']
    default:
      return ['read']
  }
}
