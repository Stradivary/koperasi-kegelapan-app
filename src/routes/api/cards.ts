import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db'
import { cards, users } from '#/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export const Route = createFileRoute('/api/cards')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const tenantId = url.searchParams.get('tenantId')
        if (!tenantId) return errJson(400, 'tenantId required')

        const db = getDb()
        const rows = await db
          .select({
            cardId: cards.cardId,
            userId: cards.userId,
            status: cards.status,
            balance: cards.balance,
            counter: cards.counter,
            keyVersion: cards.keyVersion,
            expiresAt: cards.expiresAt,
            lastActivityAt: cards.lastActivityAt,
            userName: users.name,
          })
          .from(cards)
          .leftJoin(users, and(eq(users.tenantId, cards.tenantId), eq(users.userId, sql`${cards.userId}`)))
          .where(eq(cards.tenantId, tenantId))
          .all()

        const result = rows.map((r) => ({ ...r, cardId: toHex(r.cardId) }))
        return jsonOk(result)
      },

      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body?.tenantId || !body?.cardId) return errJson(400, 'tenantId and cardId required')

        const db = getDb()
        const cardIdBuf = Buffer.from(body.cardId, 'hex')
        await db.insert(cards).values({
          tenantId: body.tenantId,
          cardId: cardIdBuf,
          userId: body.userId ?? null,
          status: 'active',
          balance: body.balance ?? 0,
          counter: 0,
          keyVersion: 1,
          expiresAt: body.expiresAt ? new Date(body.expiresAt * 1000) : null,
        }).run()

        return jsonOk({ ok: true })
      },

      PATCH: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!body?.tenantId || !body?.cardId) return errJson(400, 'tenantId and cardId required')

        const db = getDb()
        const cardIdBuf = Buffer.from(body.cardId, 'hex')
        const update: Record<string, unknown> = {}
        if (body.status) update.status = body.status
        if (body.balance !== undefined) update.balance = body.balance

        await db.update(cards)
          .set(update)
          .where(and(eq(cards.tenantId, body.tenantId), eq(cards.cardId, cardIdBuf)))
          .run()

        return jsonOk({ ok: true })
      },
    },
  },
})

function toHex(buf: unknown): string {
  return Buffer.from(buf as ArrayBuffer).toString('hex')
}
function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}
function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}
