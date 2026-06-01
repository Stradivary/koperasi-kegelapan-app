import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionGrant } from "#/core/payload/types";
import { API_BASE_URL, apiFetch } from "#/lib/api";
import type { CachedSessionGrant } from "#/lib/indexeddb";
import { getSessionGrantCacheStore } from "#/lib/indexeddb.lazy";
import { issueAndCacheLocalSessionGrant } from "#/lib/localSessionGrant";

const REFRESH_BUFFER_SECONDS = 300;
export const OFFLINE_GRACE_PERIOD_SECONDS = 3600;

/** Local master key seed for offline session grant derivation */
const LOCAL_MASTER_SEED = "koperasi-local-session-key-v1";

/**
 * Generate a session grant locally for offline/local-only tenants.
 * Uses Web Crypto HMAC-SHA256 to derive a deterministic session key
 * from the tenantId, mirroring the server-side derivation logic.
 */
async function generateLocalSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
): Promise<SessionGrant> {
  const enc = new TextEncoder();

  // Derive a master key from the local seed
  const masterKeyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(LOCAL_MASTER_SEED),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Derive tenant key: HMAC(masterKey, tenantId:1)
  const tenantKeyBuf = await crypto.subtle.sign(
    "HMAC",
    masterKeyMaterial,
    enc.encode(`${tenantId}:1`),
  );

  // Derive session key: HMAC(tenantKey, "session-key")
  const tenantKey = await crypto.subtle.importKey(
    "raw",
    tenantKeyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sessionKeyBuf = await crypto.subtle.sign("HMAC", tenantKey, enc.encode("session-key"));

  // Derive signature: HMAC(tenantKey, payload)
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year
  const allowedOps = ["read", "debit", "credit", "checkin", "checkout", "admin", "station"];
  const sigPayload = JSON.stringify({ keyVersion: 1, expiresAt, allowedOps, accountId, deviceId });
  const signatureBuf = await crypto.subtle.sign("HMAC", tenantKey, enc.encode(sigPayload));

  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(sessionKeyBuf),
    expiresAt,
    allowedOps,
    signature: new Uint8Array(signatureBuf),
    tenantId,
    accountId,
    deviceId,
  };
}

async function fetchSessionGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role?: string,
): Promise<SessionGrant> {
  const params = new URLSearchParams({ tenantId, deviceId });
  if (role) params.set("role", role);
  const res = await apiFetch(
    `${API_BASE_URL}/api/session-grant?${params}`,
    {
      headers: { "Content-Type": "application/json" },
    },
    tenantId,
  );
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
  const std = b64.replaceAll("-", "+").replaceAll("_", "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i) ?? 0;
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCodePoint(byte);
  return btoa(bin);
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

/** Convert a SessionGrant to a CachedSessionGrant for IndexedDB storage. */
function toCachedGrant(grant: SessionGrant): CachedSessionGrant {
  return {
    tenantId: grant.tenantId,
    accountId: grant.accountId,
    deviceId: grant.deviceId,
    keyVersion: grant.keyVersion,
    sessionKeyB64: bytesToBase64(grant.sessionKey),
    expiresAt: grant.expiresAt,
    allowedOps: grant.allowedOps,
    signatureB64: bytesToBase64(grant.signature),
    cachedAt: Date.now(),
  };
}

/** Convert a CachedSessionGrant from IndexedDB back to a SessionGrant. */
function fromCachedGrant(cached: CachedSessionGrant): SessionGrant {
  return {
    tenantId: cached.tenantId,
    accountId: cached.accountId,
    deviceId: cached.deviceId,
    keyVersion: cached.keyVersion,
    sessionKey: base64ToBytes(cached.sessionKeyB64),
    expiresAt: cached.expiresAt,
    allowedOps: cached.allowedOps,
    signature: base64ToBytes(cached.signatureB64),
  };
}

/** Write a session grant to IndexedDB cache. */
async function writeGrantToCache(grant: SessionGrant): Promise<void> {
  try {
    const sessionGrantCacheStore = await getSessionGrantCacheStore();
    await sessionGrantCacheStore.put(toCachedGrant(grant));
  } catch {
    // Silently fail - caching is best-effort
  }
}

/** Read a session grant from IndexedDB cache. Returns null if not found or expired.
 *  When offline, allows expired grants within the grace period for offline operations. */
async function readGrantFromCache(
  tenantId: string,
  accountId: string,
  deviceId: string,
): Promise<SessionGrant | null> {
  try {
    const sessionGrantCacheStore = await getSessionGrantCacheStore();
    const cached = await sessionGrantCacheStore.get(tenantId, accountId, deviceId);
    if (!cached) return null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isOffline = typeof navigator === "undefined" ? false : !navigator.onLine;

    if (cached.expiresAt <= nowSeconds) {
      // Grant is expired - allow it if offline and within grace period
      if (isOffline && cached.expiresAt > nowSeconds - OFFLINE_GRACE_PERIOD_SECONDS) {
        return fromCachedGrant(cached);
      }
      return null; // Expired beyond grace period or online
    }
    return fromCachedGrant(cached);
  } catch {
    return null;
  }
}

/**
 * Try to generate a local session grant unconditionally.
 * Previously gated on LocalTenantConfig existence, but that caused failures
 * on devices that hadn't completed local setup (e.g., second device login
 * where config wasn't cached yet). The grant derivation only needs tenantId,
 * accountId, and deviceId - no config dependency required.
 */
async function tryLocalGrant(
  tenantId: string,
  accountId: string,
  deviceId: string,
): Promise<SessionGrant | null> {
  try {
    return await generateLocalSessionGrant(tenantId, accountId, deviceId);
  } catch {
    // Web Crypto unavailable or other unexpected error
    return null;
  }
}

interface OnlineRefreshCallbacks {
  setGrant: (g: SessionGrant) => void;
  scheduleRefreshFn: (g: SessionGrant) => void;
  setError: (e: string) => void;
}

/** Handles the online branch of the refresh logic. */
async function handleOnlineRefresh(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string | undefined,
  cachedGrant: SessionGrant | null,
  callbacks: OnlineRefreshCallbacks,
): Promise<void> {
  const { setGrant, scheduleRefreshFn, setError } = callbacks;

  try {
    const newGrant = await fetchSessionGrant(tenantId, accountId, deviceId, role);
    setGrant(newGrant);
    scheduleRefreshFn(newGrant);
    // Write-through: cache the fresh grant for future offline use
    writeGrantToCache(newGrant);
  } catch (e) {
    // Network fetch failed even though online - use cached grant if available
    if (cachedGrant) {
      setGrant(cachedGrant);
      scheduleRefreshFn(cachedGrant);
    } else {
      // Last resort: issue a local session grant (for local-only tenants or network issues)
      try {
        const localGrant = await issueAndCacheLocalSessionGrant(
          tenantId,
          accountId,
          deviceId,
          role ?? "terminal",
        );
        setGrant(localGrant);
        scheduleRefreshFn(localGrant);
      } catch {
        setError(String(e));
      }
    }
  }
}

/** Handles the offline branch of the refresh logic. */
async function handleOfflineRefresh(
  tenantId: string,
  accountId: string,
  deviceId: string,
  role: string | undefined,
  cachedGrant: SessionGrant | null,
  setGrant: (g: SessionGrant) => void,
  setError: (e: string) => void,
): Promise<void> {
  if (cachedGrant) {
    setGrant(cachedGrant);
    // Don't schedule refresh when offline - it would just loop since we can't fetch
  } else {
    // No cached grant while offline - issue locally so NFC operations can proceed
    try {
      const localGrant = await issueAndCacheLocalSessionGrant(
        tenantId,
        accountId,
        deviceId,
        role ?? "terminal",
      );
      setGrant(localGrant);
    } catch {
      // Offline with no cache - generate locally for local-only tenants
      const localGrant = await tryLocalGrant(tenantId, accountId, deviceId);
      if (localGrant) {
        setGrant(localGrant);
        writeGrantToCache(localGrant);
      } else {
        setError("Offline dan tidak ada sesi tersimpan");
      }
    }
  }
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

    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    // First, check IndexedDB for a cached grant
    const cachedGrant = await readGrantFromCache(tenantId, accountId, deviceId);

    if (isOnline) {
      await handleOnlineRefresh(tenantId, accountId, deviceId, role, cachedGrant, {
        setGrant,
        scheduleRefreshFn: (g) => scheduleRefresh(refreshTimerRef, g, refresh),
        setError,
      });
    } else {
      await handleOfflineRefresh(
        tenantId,
        accountId,
        deviceId,
        role,
        cachedGrant,
        setGrant,
        setError,
      );
    }

    setLoading(false);
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

  const nowSeconds = Math.floor(Date.now() / 1000);
  const isOffline = typeof navigator === "undefined" ? false : !navigator.onLine;
  const isValid =
    grant !== null &&
    (nowSeconds < grant.expiresAt ||
      (isOffline && grant.expiresAt > nowSeconds - OFFLINE_GRACE_PERIOD_SECONDS));

  return { grant: isValid ? grant : null, loading, error, refresh };
}
