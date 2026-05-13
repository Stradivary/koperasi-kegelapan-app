import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema.ts'

export function getDb() {
  return drizzle({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
    schema,
  })
}
