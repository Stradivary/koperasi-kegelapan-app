import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import { hashPassword, generateId } from '../server/auth'
import { faker } from '@faker-js/faker/locale/id_ID'

async function seed() {
  const { env, dispose } = await getPlatformProxy<CloudflareEnv>()
  const db = drizzle(env.DB, { schema })

  console.log('🌱 Seeding database...')

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
  await db.insert(schema.tenants).values([tenantA, tenantB])
  console.log('✓ Tenants: Koperasi A, Koperasi B')

  const roles = ['admin', 'terminal', 'gate', 'station'] as const
  const accounts = [tenantA, tenantB].flatMap((tenant) =>
    roles.map((role) => ({
      accountId: generateId(),
      tenantId: tenant.tenantId,
      username: `${role}-${tenant.slug.split('-')[1]}`,
      passwordHash: hashPassword('password'),
      role,
      status: 'active' as const,
    })),
  )
  await db.insert(schema.accounts).values(accounts)
  console.log('✓ Accounts: 4 per tenant (admin, terminal, gate, station) — password: "password"')

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 365 * 24 * 60 * 60

  for (const tenant of [tenantA, tenantB]) {
    for (let i = 1; i <= 10; i++) {
      await db.insert(schema.users).values({
        tenantId: tenant.tenantId,
        userId: i,
        name: faker.person.fullName(),
        status: 'active',
      })

      await db.insert(schema.cards).values({
        tenantId: tenant.tenantId,
        cardId: Buffer.from([i, 0, 0, 0, 0, i & 0xff]),
        userId: i,
        status: 'active',
        balance: faker.number.int({ min: 50_000, max: 1_000_000 }),
        counter: faker.number.int({ min: 0, max: 20 }),
        keyVersion: 1,
        expiresAt: new Date(expiresAt * 1000),
      })
    }
    console.log(`✓ ${tenant.slug}: 10 users + 10 cards`)
  }

  console.log('\n✅ Seed complete.')
  console.log('Accounts (password: "password"):')
  console.log('  Koperasi A: admin-a, terminal-a, gate-a, station-a')
  console.log('  Koperasi B: admin-b, terminal-b, gate-b, station-b')

  await dispose()
}

seed().catch((e) => { console.error(e); process.exit(1) })
