import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionGrant } from '../core/payload/types'

const REFRESH_BUFFER_SECONDS = 300

async function fetchSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
): Promise<SessionGrant> {
  const res = await fetch(`/api/session-grant?tenantId=${tenantId}&deviceId=${deviceId}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Failed to fetch session grant: ${res.status}`)
  const data = await res.json()
  return {
    keyVersion: data.keyVersion,
    sessionKey: base64ToBytes(data.sessionKey),
    expiresAt: data.expiresAt,
    allowedOps: data.allowedOps,
    signature: base64ToBytes(data.signature),
    tenantId,
    accountId,
    deviceId,
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function useSessionGrant(tenantId: string, accountId: string, deviceId: string) {
  const [grant, setGrant] = useState<SessionGrant | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const newGrant = await fetchSessionGrant(tenantId, accountId, deviceId)
      setGrant(newGrant)
      scheduleRefresh(newGrant)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [tenantId, accountId, deviceId])

  function scheduleRefresh(g: SessionGrant) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const nowSeconds = Math.floor(Date.now() / 1000)
    const delay = Math.max(0, (g.expiresAt - nowSeconds - REFRESH_BUFFER_SECONDS) * 1000)
    refreshTimerRef.current = setTimeout(refresh, delay)
  }

  useEffect(() => {
    if (tenantId && accountId && deviceId) refresh()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [tenantId, accountId, deviceId, refresh])

  const isValid = grant !== null && Math.floor(Date.now() / 1000) < grant.expiresAt

  return { grant: isValid ? grant : null, loading, error, refresh }
}
