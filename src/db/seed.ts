import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { hashPassword, generateId } from '../server/auth'
import { faker } from '@faker-js/faker/locale/id_ID'

const DATABASE_URL = process.env.DATABASE_URL ?? './.data/sqlite.db'

async function seed() {
  const sqlite = new Database(DATABASE_URL)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema })

  console.log('🌱 Seeding database...')

  // --- Tenants ---
  const tenantA = {
    tenantId: generateId(),
    slug: 'koperasi-a',
    name: 'Koperasi A',
    status: 'active' as const,
    timezone: 'Asia/Jakarta',
  }
  const tenantB = {
    tenantId: generateId(),
    slug: 'koperasi-b',
    name: 'Koperasi B',
    status: 'active' as const,
    timezone: 'Asia/Jakarta',
  }
  db.insert(schema.tenants).values([tenantA, tenantB]).run()
  console.log('✓ Tenants: Koperasi A, Koperasi B')

  // --- Accounts ---
  const accounts = [
    // Koperasi A
    {
      accountId: generateId(),
      tenantId: tenantA.tenantId,
      username: 'admin-a',
      passwordHash: hashPassword('password'),
      role: 'admin' as const,
      status: 'active' as const,
    },
    {
      accountId: generateId(),
      tenantId: tenantA.tenantId,
      username: 'terminal-a',
      passwordHash: hashPassword('password'),
      role: 'terminal' as const,
      status: 'active' as const,
    },
    {
      accountId: generateId(),
      tenantId: tenantA.tenantId,
      username: 'gate-a',
      passwordHash: hashPassword('password'),
      role: 'gate' as const,
      status: 'active' as const,
    },
    {
      accountId: generateId(),
      tenantId: tenantA.tenantId,
      username: 'station-a',
      passwordHash: hashPassword('password'),
      role: 'station' as const,
      status: 'active' as const,
    },
    // Koperasi B
    {
      accountId: generateId(),
      tenantId: tenantB.tenantId,
      username: 'admin-b',
      passwordHash: hashPassword('password'),
      role: 'admin' as const,
      status: 'active' as const,
    },
    {
      accountId: generateId(),
      tenantId: tenantB.tenantId,
      username: 'terminal-b',
      passwordHash: hashPassword('password'),
      role: 'terminal' as const,
      status: 'active' as const,
    },
    {
      accountId: generateId(),
      tenantId: tenantB.tenantId,
      username: 'gate-b',
      passwordHash: hashPassword('password'),
      role: 'gate' as const,
      status: 'active' as const,
    },
    {
      accountId: generateId(),
      tenantId: tenantB.tenantId,
      username: 'station-b',
      passwordHash: hashPassword('password'),
      role: 'station' as const,
      status: 'active' as const,
    },
  ]
  db.insert(schema.accounts).values(accounts).run()
  console.log('✓ Accounts: 4 per tenant (admin, terminal, gate, station) — password: "password"')

  // --- Users and Cards ---
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 365 * 24 * 60 * 60

  for (const tenant of [tenantA, tenantB]) {
    const label = tenant.slug

    for (let i = 1; i <= 10; i++) {
      const userId = i
      const name = faker.person.fullName()

      db.insert(schema.users).values({
        tenantId: tenant.tenantId,
        userId,
        name,
        status: 'active',
      }).run()

      const cardId = Buffer.from([i, 0, 0, 0, 0, i & 0xff])
      const balance = faker.number.int({ min: 50_000, max: 1_000_000 })

      db.insert(schema.cards).values({
        tenantId: tenant.tenantId,
        cardId,
        userId,
        status: 'active',
        balance,
        counter: faker.number.int({ min: 0, max: 20 }),
        keyVersion: 1,
        expiresAt: new Date(expiresAt * 1000),
      }).run()
    }
    console.log(`✓ ${label}: 10 users + 10 cards`)
  }

  console.log('\n✅ Seed complete.')
  console.log('\nAccounts (password for all: "password"):')
  console.log('  Koperasi A: admin-a, terminal-a, gate-a, station-a')
  console.log('  Koperasi B: admin-b, terminal-b, gate-b, station-b')

  sqlite.close()
}

seed().catch((e) => { console.error(e); process.exit(1) })
