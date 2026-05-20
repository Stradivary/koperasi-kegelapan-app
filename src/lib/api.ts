import { checkDeviceBlockResponse, isDeviceBlocked } from "./deviceBlock";
import { authTokenCacheStore } from "./indexeddb";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://koperasi-kegelapan-api.ahmad-muzaki-st.workers.dev";

// ── Device ID cache for request headers ────────────────────────────────

/**
 * In-memory cache of the current device ID.
 * Set during login (setCurrentDeviceId) and included in all apiFetch requests
 * as the X-Device-Id header for server-side device tracking and block enforcement.
 */
let _cachedDeviceId: string | null = null;

/**
 * Set the current device ID to be included in all subsequent API requests.
 * Call this after login when the deviceId is obtained from the server or fingerprint.
 */
export function setCurrentDeviceId(deviceId: string | null): void {
  _cachedDeviceId = deviceId;
}

/**
 * Get the current cached device ID.
 * Returns null if no device ID has been set (e.g., before login).
 */
export function getCurrentDeviceId(): string | null {
  return _cachedDeviceId;
}

// ── Access token cache for Authorization header ────────────────────────

/**
 * In-memory cache of the current access token (JWT-like).
 * Set during login (setAccessToken) and included in all apiFetch requests
 * as the Authorization: Bearer header for server-side authentication.
 */
let _cachedAccessToken: string | null = null;

/**
 * Set the current access token to be included in all subsequent API requests.
 * Also persists the token to IndexedDB so it survives page refreshes.
 * Call this after login when the accessToken is obtained from the server.
 *
 * @param token - The access token string, or null to clear
 * @param expiresAt - Optional expiry timestamp in epoch ms (0 = no known expiry, defaults to 24h)
 */
export function setAccessToken(token: string | null, expiresAt?: number): void {
  _cachedAccessToken = token;
  // Persist to IndexedDB (best-effort, non-blocking)
  if (token && _cachedDeviceId) {
    const expiry = expiresAt ?? Date.now() + 24 * 60 * 60 * 1000; // default 24h
    authTokenCacheStore
      .put({
        deviceId: _cachedDeviceId,
        accessToken: token,
        expiresAt: expiry,
        storedAt: Date.now(),
      })
      .catch(() => {
        // Silently fail — persistence is best-effort
      });
  } else if (!token && _cachedDeviceId) {
    authTokenCacheStore.delete(_cachedDeviceId).catch(() => {});
  }
}

/**
 * Get the current cached access token.
 * Returns null if no token has been set (e.g., before login).
 */
export function getAccessToken(): string | null {
  return _cachedAccessToken;
}

/**
 * Restore auth state (deviceId + accessToken) from IndexedDB on app boot.
 * Call this once during app initialization (e.g., in detectMode or root layout).
 * Returns true if auth state was successfully restored.
 */
export async function restoreAuthState(deviceId: string): Promise<boolean> {
  _cachedDeviceId = deviceId;
  try {
    const entry = await authTokenCacheStore.get(deviceId);
    if (entry) {
      _cachedAccessToken = entry.accessToken;
      return true;
    }
  } catch {
    // IndexedDB unavailable — continue without token
  }
  return false;
}

/**
 * Fetch wrapper that automatically checks for device_blocked 403 responses,
 * suppresses requests while the device is blocked, and injects the X-Device-Id
 * header into all outgoing requests.
 *
 * Use this instead of raw `fetch` for authenticated API calls.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param tenantId - Optional tenant ID for scoped auth state clearing
 * @returns The fetch Response, or throws if device is blocked
 */
export async function apiFetch(
  url: string | URL,
  options?: RequestInit,
  tenantId?: string,
): Promise<Response> {
  // Suppress outbound requests while device is blocked
  if (isDeviceBlocked()) {
    throw new DeviceBlockedError("Device is blocked — request suppressed");
  }

  // Inject X-Device-Id and Authorization headers if cached
  const mergedOptions = injectAuthHeaders(options);

  const response = await fetch(url, mergedOptions);

  // Check if this is a device_blocked response
  const wasBlocked = await checkDeviceBlockResponse(response, tenantId);
  if (wasBlocked) {
    throw new DeviceBlockedError("Device has been blocked by server");
  }

  return response;
}

/**
 * Merge the X-Device-Id and Authorization headers into the request options.
 * Injects X-Device-Id if a device ID is cached, and Authorization: Bearer if
 * an access token is cached. Preserves any existing headers provided by the caller.
 */
function injectAuthHeaders(options?: RequestInit): RequestInit | undefined {
  if (!_cachedDeviceId && !_cachedAccessToken) return options;

  const existingHeaders = options?.headers;
  let headers: HeadersInit;

  if (existingHeaders instanceof Headers) {
    // Clone to avoid mutating the caller's Headers object
    headers = new Headers(existingHeaders);
    if (_cachedDeviceId && !headers.has("X-Device-Id")) {
      headers.set("X-Device-Id", _cachedDeviceId);
    }
    if (_cachedAccessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${_cachedAccessToken}`);
    }
  } else if (Array.isArray(existingHeaders)) {
    // Array of [key, value] pairs
    const hasDeviceId = existingHeaders.some(([key]) => key.toLowerCase() === "x-device-id");
    const hasAuth = existingHeaders.some(([key]) => key.toLowerCase() === "authorization");
    headers = [...existingHeaders];
    if (_cachedDeviceId && !hasDeviceId) {
      headers.push(["X-Device-Id", _cachedDeviceId]);
    }
    if (_cachedAccessToken && !hasAuth) {
      headers.push(["Authorization", `Bearer ${_cachedAccessToken}`]);
    }
  } else {
    // Record<string, string> or undefined
    const record = (existingHeaders ?? {}) as Record<string, string>;
    const keys = Object.keys(record).map((k) => k.toLowerCase());
    headers = { ...record };
    if (_cachedDeviceId && !keys.includes("x-device-id")) {
      (headers as Record<string, string>)["X-Device-Id"] = _cachedDeviceId;
    }
    if (_cachedAccessToken && !keys.includes("authorization")) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${_cachedAccessToken}`;
    }
  }

  return { ...options, headers };
}

/** Error thrown when a request is suppressed due to device block. */
export class DeviceBlockedError extends Error {
  readonly isDeviceBlocked = true;

  constructor(message: string) {
    super(message);
    this.name = "DeviceBlockedError";
  }
}
