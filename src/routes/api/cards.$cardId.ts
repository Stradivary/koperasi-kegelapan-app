import { createFileRoute } from '@tanstack/react-router'
import { getDb } from '#/db'
import { cards } from '#/db/schema'
import { eq, and } from 'drizzle-orm'

export const Route = createFileRoute('/api/cards/$cardId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const tenantId = url.searchParams.get('tenantId')
        if (!tenantId) return errJson(400, 'tenantId required')

        const db = getDb()
        const cardIdBuf = Buffer.from(params.cardId, 'hex')
        const card = await db
          .select()
          .from(cards)
          .where(and(eq(cards.tenantId, tenantId), eq(cards.cardId, cardIdBuf)))
          .get()

        if (!card) return errJson(404, 'Card not found')
        return new Response(
          JSON.stringify({ ...card, cardId: Buffer.from(card.cardId as unknown as ArrayBuffer).toString('hex') }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}
