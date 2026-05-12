import { createFileRoute } from '@tanstack/react-router'
import { getDefaultPolicy } from '#/server/policy'

export const Route = createFileRoute('/api/policy')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const tenantId = url.searchParams.get('tenantId')
        if (!tenantId) return errJson(400, 'tenantId required')
        return jsonOk(getDefaultPolicy(tenantId))
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
