import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDefaultPolicy } from '../../../server/policy'

export const APIRoute = createAPIFileRoute('/api/policy')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const tenantId = url.searchParams.get('tenantId')
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const policy = getDefaultPolicy(tenantId)
    return new Response(JSON.stringify(policy), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
