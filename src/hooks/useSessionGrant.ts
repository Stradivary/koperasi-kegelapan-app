import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionGrant } from "../core/payload/types";

const REFRESH_BUFFER_SECONDS = 300;

async function fetchSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role?: string,
): Promise<SessionGrant> {
  const params = new URLSearchParams({ tenantId, deviceId });
  if (role) params.set("role", role);
  const res = await fetch(`/api/session-grant?${params}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch session grant: ${res.status}`);
  const data = await res.json();
  return {
    keyVersion: data.keyVersion,
    sessionKey: base64ToBytes(data.sessionKey),
    expiresAt: data.expiresAt,
    allowedOps: data.allowedOps,
    signature: base64ToBytes(data.signature),
    tenantId,
    accountId,
    deviceId,
  };
}

function base64ToBytes(b64: string): Uint8Array {
  // Normalize base64url (uses - and _ without padding) to standard base64
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function scheduleRefresh(
  ref: React.RefObject<ReturnType<typeof setTimeout> | null>,
  g: SessionGrant,
  refresh: () => void,
) {
  if (ref.current) clearTimeout(ref.current);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const delay = Math.max(0, (g.expiresAt - nowSeconds - REFRESH_BUFFER_SECONDS) * 1000);
  ref.current = setTimeout(refresh, delay);
}

export function useSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role?: string,
) {
  const [grant, setGrant] = useState<SessionGrant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newGrant = await fetchSessionGrant(tenantId, accountId, deviceId, role);
      setGrant(newGrant);
      scheduleRefresh(refreshTimerRef, newGrant, refresh);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, accountId, deviceId, role]);

  useEffect(() => {
    if (tenantId && accountId && deviceId) refresh();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timer = refreshTimerRef.current;
      if (timer) clearTimeout(timer);
    };
  }, [tenantId, accountId, deviceId, refresh]);

  const isValid = grant !== null && Math.floor(Date.now() / 1000) < grant.expiresAt;

  return { grant: isValid ? grant : null, loading, error, refresh };
}
