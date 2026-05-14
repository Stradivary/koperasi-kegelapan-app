import { config } from 'dotenv'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import { hashPassword, generateId } from '../server/auth'

config({ path: ['.env.local', '.env'] })

async function seed() {
  const { env, dispose } = await getPlatformProxy<CloudflareEnv>()
  const db = drizzle(env.DB, { schema })

  console.log('🌱 Seeding D1 database...')

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
  await db.insert(schema.tenants)
    .values([tenantA, tenantB])
    .onConflictDoNothing({ target: schema.tenants.slug })

  const { eq } = await import('drizzle-orm')
  const persistedTenantA = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, tenantA.slug)).get()
  const persistedTenantB = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, tenantB.slug)).get()

  if (!persistedTenantA || !persistedTenantB) throw new Error('Unable to resolve seeded tenant rows')

  console.log('✓ Tenants: Koperasi A, Koperasi B')

  const roles = ['admin', 'terminal', 'gate', 'station'] as const
  const accounts = [persistedTenantA, persistedTenantB].flatMap((tenant) =>
    roles.map((role) => ({
      accountId: generateId(),
      tenantId: tenant.tenantId,
      username: `${role}-${tenant.slug.split('-')[1]}`,
      passwordHash: hashPassword('password'),
      role,
      status: 'active' as const,
    })),
  )
  await db.insert(schema.accounts).values(accounts).onConflictDoNothing()
  console.log('✓ Accounts: 4 per tenant (admin, terminal, gate, station) — password: "password"')

  console.log('\n✅ D1 seed complete.')
  console.log('Accounts (password: "password"):')
  console.log('  Koperasi A: admin-a, terminal-a, gate-a, station-a')
  console.log('  Koperasi B: admin-b, terminal-b, gate-b, station-b')
  console.log('\nNote: Users and cards are stored in IndexedDB (browser-local).')

  await dispose()
}

seed().catch((e) => { console.error(e); process.exit(1) })
