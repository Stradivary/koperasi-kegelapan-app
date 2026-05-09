import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

type DB = ReturnType<typeof drizzle<typeof schema>>

let _db: DB | null = null

export function getDb(): DB {
  if (!_db) {
    _db = drizzle(process.env.DATABASE_URL!, { schema })
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
