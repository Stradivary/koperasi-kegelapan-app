import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db'
import { auditLog } from '#/db/schema'
import { eq, desc } from 'drizzle-orm'

export const Route = createFileRoute('/api/audit')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const tenantId = url.searchParams.get('tenantId')
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
        if (!tenantId) return errJson(400, 'tenantId required')

        const db = getDb()
        const rows = await db
          .select()
          .from(auditLog)
          .where(eq(auditLog.tenantId, tenantId))
          .orderBy(desc(auditLog.createdAt))
          .limit(limit)
          .all()

        const result = rows.map((r) => ({
          ...r,
          cardId: Buffer.from(r.cardId as unknown as ArrayBuffer).toString('hex'),
          hash: Buffer.from(r.hash as unknown as ArrayBuffer).toString('hex'),
          timestamp: r.timestamp ? Math.floor(new Date(r.timestamp).getTime() / 1000) : null,
        }))

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
      },
    },
  },
})

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}
