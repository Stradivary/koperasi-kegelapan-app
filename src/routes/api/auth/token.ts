import { createAPIFileRoute } from '@tanstack/react-start/api'
import { db } from '../../../db'
import { accounts, tenants } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { verifyPassword, generateId } from '../../../server/auth'

export const APIRoute = createAPIFileRoute('/api/auth/token')({
  POST: async ({ request }) => {
    const json = await request.json().catch(() => null)
    if (!json?.username || !json?.password) {
      return json400('username and password required')
    }

    const account = db
      .select()
      .from(accounts)
      .where(and(eq(accounts.username, json.username), eq(accounts.status, 'active')))
      .get()

    if (!account || !verifyPassword(json.password, account.passwordHash)) {
      return json401('Invalid credentials')
    }

    const tenant = db
      .select()
      .from(tenants)
      .where(eq(tenants.tenantId, account.tenantId))
      .get()

    if (!tenant || tenant.status !== 'active') {
      return json401('Tenant inactive')
    }

    return jsonOk({
      accountId: account.accountId,
      tenantId: account.tenantId,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      role: account.role,
    })
  },
})

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function json400(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}
function json401(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
