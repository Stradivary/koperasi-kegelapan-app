import { createAPIFileRoute } from '@tanstack/react-start/api'
import { issueSessionGrant } from '../../../server/sessionGrant'

export const APIRoute = createAPIFileRoute('/api/session-grant')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const tenantId = url.searchParams.get('tenantId')
    const deviceId = url.searchParams.get('deviceId') ?? 'unknown'

    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!tenantId) {
      return errJson(400, 'tenantId required')
    }

    const accountId = token ? decodeAccountId(token) : 'anonymous'
    const role = token ? decodeRole(token) : 'terminal'

    const grant = issueSessionGrant(tenantId, accountId, deviceId, role)

    return new Response(JSON.stringify(grant), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

function decodeAccountId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
    return payload.accountId ?? 'anonymous'
  } catch {
    return 'anonymous'
  }
}

function decodeRole(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
    return payload.role ?? 'terminal'
  } catch {
    return 'terminal'
  }
}

function errJson(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
