import { createAPIFileRoute } from '@tanstack/react-start/api'
import { db } from '../../../db'
import { cards, auditLog } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { nowSeconds } from '../../../server/auth'

interface ReconcileEvent {
  cardId: string
  counter: number
  type: string
  amount: number
  balanceAfter: number
  timestamp: number
  hash: string
  idempotencyKey?: string
}

export const APIRoute = createAPIFileRoute('/api/reconcile')({
  POST: async ({ request }) => {
    const body = await request.json().catch(() => null)
    if (!body?.terminalId || !Array.isArray(body.events)) {
      return errJson(400, 'terminalId and events[] required')
    }

    const tenantId = request.headers.get('x-tenant-id') ?? body.tenantId
    if (!tenantId) return errJson(400, 'tenantId required')

    const accepted: string[] = []
    const rejected: Array<{ id: string; reason: string }> = []
    const flags: Array<{ id: string; flag: string }> = []

    for (const event of body.events as ReconcileEvent[]) {
      try {
        const cardIdBuf = Buffer.from(event.cardId, 'hex')
        const card = db
          .select()
          .from(cards)
          .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBuf)))
          .get()

        if (!card) {
          rejected.push({ id: event.cardId, reason: 'Card not found' })
          continue
        }

        if (event.counter <= card.counter) {
          rejected.push({ id: event.cardId, reason: 'Stale counter' })
          continue
        }

        const LIMIT = 1_000_000
        if (event.amount > LIMIT) {
          flags.push({ id: event.cardId, flag: 'amount_exceeds_limit' })
        }

        db.update(cards)
          .set({
            balance: event.balanceAfter,
            counter: event.counter,
            lastActivityAt: new Date(event.timestamp * 1000),
          })
          .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBuf)))
          .run()

        db.insert(auditLog)
          .values({
            tenantId,
            cardId: cardIdBuf,
            counter: event.counter,
            type: event.type as 'debit' | 'credit' | 'checkin' | 'checkout' | 'admin',
            amount: event.amount,
            balanceAfter: event.balanceAfter,
            timestamp: new Date(event.timestamp * 1000),
            hash: Buffer.from(event.hash, 'hex'),
            terminalId: body.terminalId,
            flagged: event.amount > LIMIT,
          })
          .run()

        accepted.push(event.cardId)
      } catch (e) {
        rejected.push({ id: event.cardId, reason: String(e) })
      }
    }

    return jsonOk({ accepted: accepted.length, rejected: rejected.length, flags, rejectedItems: rejected })
  },
})

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}
function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}
