import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'

import * as schema from './schema.ts'

type DB = ReturnType<typeof drizzlePostgres<typeof schema>>

type D1Client = Parameters<typeof drizzleD1>[0]

let _db: DB | null = null

function getD1Client(): D1Client | undefined {
  return (globalThis as any).__env?.['MBC_D1'] as D1Client | undefined
}

export function getDb(): DB {
  if (!_db) {
    const d1 = getD1Client()
    if (d1) {
      _db = drizzleD1(d1, { schema: schema as unknown as any }) as unknown as DB
    } else if (process.env.DATABASE_URL) {
      _db = drizzlePostgres(process.env.DATABASE_URL, { schema })
    } else {
      throw new Error(
        'No database configured. Set DATABASE_URL locally or bind a D1 database as MBC_D1 in wrangler.jsonc.',
      )
    }
  }

  return _db
}

/**
 * Lazy-initialized database instance.
 * Connection is only established on first property access,
 * so the server can start even without a running database.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const instance = getDb()
    const value = Reflect.get(instance, prop, receiver)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
