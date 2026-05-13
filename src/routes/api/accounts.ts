import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db'
import { accounts } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { hashPassword, generateId } from '#/server/auth'

export const Route = createFileRoute('/api/accounts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const tenantId = url.searchParams.get('tenantId')
        if (!tenantId) return errJson(400, 'tenantId required')

        const db = await getDb()
        const rows = await db
          .select({
            accountId: accounts.accountId,
            username: accounts.username,
            role: accounts.role,
            status: accounts.status,
            createdAt: accounts.createdAt,
          })
          .from(accounts)
          .where(eq(accounts.tenantId, tenantId))
          .all()

        return jsonOk(rows)
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body?.tenantId || !body?.username?.trim() || !body?.password || !body?.role) {
          return errJson(400, 'tenantId, username, password, and role required')
        }
        const validRoles = ['admin', 'station', 'gate', 'terminal', 'scout']
        if (!validRoles.includes(body.role)) return errJson(400, 'invalid role')
        if (body.password.length < 8) return errJson(400, 'password must be at least 8 characters')

        const db = await getDb()
        const accountId = generateId()
        const passwordHash = hashPassword(body.password)

        try {
          await db.insert(accounts).values({
            accountId,
            tenantId: body.tenantId,
            username: body.username.trim(),
            passwordHash,
            role: body.role,
            status: 'active',
          }).run()
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('UNIQUE')) return errJson(409, 'Username already exists')
          throw e
        }

        return jsonOk({ ok: true, accountId })
      },

      PATCH: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body?.tenantId || !body?.accountId || !body?.status) {
          return errJson(400, 'tenantId, accountId, and status required')
        }
        if (!['active', 'suspended'].includes(body.status)) return errJson(400, 'invalid status')

        const db = await getDb()
        await db.update(accounts)
          .set({ status: body.status })
          .where(and(eq(accounts.tenantId, body.tenantId), eq(accounts.accountId, body.accountId)))
          .run()

        return jsonOk({ ok: true })
      },
    },
  },
})

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}
function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}
