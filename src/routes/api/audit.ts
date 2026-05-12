import { createAPIFileRoute } from '@tanstack/react-start/api'
import { db } from '../../../db'
import { auditLog, cards } from '../../../db/schema'
import { eq, desc } from 'drizzle-orm'

export const APIRoute = createAPIFileRoute('/api/audit')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const tenantId = url.searchParams.get('tenantId')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
    if (!tenantId) return errJson(400, 'tenantId required')

    const rows = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .all()

    const result = rows.map((r) => ({
      ...r,
      cardId: Buffer.from(r.cardId as ArrayBuffer).toString('hex'),
      hash: Buffer.from(r.hash as ArrayBuffer).toString('hex'),
      timestamp: r.timestamp ? Math.floor(new Date(r.timestamp).getTime() / 1000) : null,
    }))

    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
  },
})

export const CardAPIRoute = createAPIFileRoute('/api/cards/$cardId')({
  GET: async ({ request, params }) => {
    const url = new URL(request.url)
    const tenantId = url.searchParams.get('tenantId')
    if (!tenantId) return errJson(400, 'tenantId required')

    const cardIdBuf = Buffer.from(params.cardId, 'hex')
    const card = db.select().from(cards)
      .where(eq(cards.tenantId, tenantId))
      .get()

    if (!card) return errJson(404, 'Card not found')
    return new Response(JSON.stringify({
      ...card,
      cardId: Buffer.from(card.cardId as ArrayBuffer).toString('hex'),
    }), { headers: { 'Content-Type': 'application/json' } })
  },
})

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}
