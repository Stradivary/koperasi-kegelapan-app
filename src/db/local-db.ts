import Dexie, { type Table } from 'dexie'

export interface User {
  tenantId: string
  userId: number
  name: string
  status: 'active' | 'suspended'
  createdAt: number
  updatedAt: number
}

export interface Card {
  tenantId: string
  cardId: string // hex string
  userId: number | null
  status: 'active' | 'blocked_tamper' | 'blocked_fraud' | 'blocked_expired' | 'blocked_admin'
  balance: number
  counter: number
  keyVersion: number
  createdAt: number
  lastActivityAt: number | null
  expiresAt: number | null
  notes: string | null
}

export interface AuditEntry {
  id?: number // auto-increment
  tenantId: string
  cardId: string // hex string
  counter: number
  type: 'debit' | 'credit' | 'checkin' | 'checkout' | 'admin'
  amount: number
  balanceAfter: number
  timestamp: number
  hash: string // hex string
  terminalId: number | null
  flagged: boolean
  createdAt: number
}

export interface SessionGrant {
  grantId: string
  tenantId: string
  accountId: string
  deviceId: string
  keyVersion: number
  allowedOps: string
  expiresAt: number
  issuedAt: number
}

class LocalDb extends Dexie {
  users!: Table<User>
  cards!: Table<Card>
  auditLog!: Table<AuditEntry>
  sessionGrants!: Table<SessionGrant>

  constructor() {
    super('koperasi-local')
    this.version(1).stores({
      users: '[tenantId+userId], tenantId',
      cards: '[tenantId+cardId], tenantId, userId',
      auditLog: '++id, tenantId, cardId, [tenantId+timestamp]',
      sessionGrants: 'grantId, tenantId, accountId',
    })
  }
}

export const localDb = new LocalDb()
