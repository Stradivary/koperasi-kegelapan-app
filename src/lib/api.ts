import { checkDeviceBlockResponse, isDeviceBlocked } from "./deviceBlock";
import { authTokenCacheStore } from "./indexeddb";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://koperasi-kegelapan-api.ahmad-muzaki-st.workers.dev";

// ── localStorage keys ──────────────────────────────────────────────────

const ACCESS_TOKEN_LS_KEY = "kk_access_token";
const DEVICE_ID_LS_KEY = "kk_device_id";

// ── Device ID cache for request headers ────────────────────────────────

/**
 * In-memory cache of the current device ID.
 * Backed by localStorage for durability across HMR and page refreshes.
 * Set during login (setCurrentDeviceId) and included in all apiFetch requests
 * as the X-Device-Id header for server-side device tracking and block enforcement.
 */
let _cachedDeviceId: string | null = null;

// Hydrate from localStorage on module load (synchronous, fast)
try {
  _cachedDeviceId = localStorage.getItem(DEVICE_ID_LS_KEY);
} catch {
  // localStorage unavailable
}

/**
 * Set the current device ID to be included in all subsequent API requests.
 * Call this after login when the deviceId is obtained from the server or fingerprint.
 */
export function setCurrentDeviceId(deviceId: string | null): void {
  _cachedDeviceId = deviceId;
  try {
    if (deviceId) {
      localStorage.setItem(DEVICE_ID_LS_KEY, deviceId);
    } else {
      localStorage.removeItem(DEVICE_ID_LS_KEY);
    }
  } catch {
    // localStorage unavailable
  }
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
 * Backed by localStorage for durability across HMR and page refreshes.
 * Set during login (setAccessToken) and included in all apiFetch requests
 * as the Authorization: Bearer header for server-side authentication.
 */
let _cachedAccessToken: string | null = null;

// Hydrate from localStorage on module load (synchronous, fast)
try {
  _cachedAccessToken = localStorage.getItem(ACCESS_TOKEN_LS_KEY);
} catch {
  // localStorage unavailable (e.g., private browsing in some browsers)
}

/**
 * Set the current access token to be included in all subsequent API requests.
 * Persists to localStorage (synchronous) and IndexedDB (async, best-effort).
 * Call this after login when the accessToken is obtained from the server.
 *
 * @param token - The access token string, or null to clear
 * @param expiresAt - Optional expiry timestamp in epoch ms (0 = no known expiry, defaults to 24h)
 */
export function setAccessToken(token: string | null, expiresAt?: number): void {
  _cachedAccessToken = token;

  // Persist to localStorage (synchronous, survives HMR/refresh)
  try {
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_LS_KEY, token);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_LS_KEY);
    }
  } catch {
    // localStorage unavailable — continue with in-memory only
  }

  // Also persist to IndexedDB (async, best-effort, survives storage clearing)
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
 *
 * Note: With localStorage backing, this is now mainly a fallback for cases where
 * localStorage was cleared but IndexedDB still has the token.
 */
export async function restoreAuthState(deviceId: string): Promise<boolean> {
  _cachedDeviceId = deviceId;
  try {
    localStorage.setItem(DEVICE_ID_LS_KEY, deviceId);
  } catch {
    // localStorage unavailable
  }

  // If we already have a token from localStorage hydration, we're good
  if (_cachedAccessToken) return true;

  // Fallback: try IndexedDB
  try {
    const entry = await authTokenCacheStore.get(deviceId);
    if (entry) {
      _cachedAccessToken = entry.accessToken;
      // Sync back to localStorage for next time
      try {
        localStorage.setItem(ACCESS_TOKEN_LS_KEY, entry.accessToken);
      } catch {
        // localStorage unavailable
      }
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
 * Inject X-Device-Id and Authorization into a Headers instance.
 */
function injectIntoHeaders(
  headers: Headers,
  deviceId: string | null,
  token: string | null,
): Headers {
  const result = new Headers(headers);
  if (deviceId && !result.has("X-Device-Id")) {
    result.set("X-Device-Id", deviceId);
  }
  if (token && !result.has("Authorization")) {
    result.set("Authorization", `Bearer ${token}`);
  }
  return result;
}

/**
 * Inject X-Device-Id and Authorization into an array of [key, value] pairs.
 */
function injectIntoArray(
  headers: [string, string][],
  deviceId: string | null,
  token: string | null,
): [string, string][] {
  const hasDeviceId = headers.some(([key]) => key.toLowerCase() === "x-device-id");
  const hasAuth = headers.some(([key]) => key.toLowerCase() === "authorization");
  const result: [string, string][] = [...headers];
  if (deviceId && !hasDeviceId) result.push(["X-Device-Id", deviceId]);
  if (token && !hasAuth) result.push(["Authorization", `Bearer ${token}`]);
  return result;
}

/**
 * Inject X-Device-Id and Authorization into a Record<string, string>.
 */
function injectIntoRecord(
  headers: Record<string, string>,
  deviceId: string | null,
  token: string | null,
): Record<string, string> {
  const keys = Object.keys(headers).map((k) => k.toLowerCase());
  const result: Record<string, string> = { ...headers };
  if (deviceId && !keys.includes("x-device-id")) result["X-Device-Id"] = deviceId;
  if (token && !keys.includes("authorization")) result["Authorization"] = `Bearer ${token}`;
  return result;
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
    headers = injectIntoHeaders(existingHeaders, _cachedDeviceId, _cachedAccessToken);
  } else if (Array.isArray(existingHeaders)) {
    headers = injectIntoArray(
      existingHeaders as [string, string][],
      _cachedDeviceId,
      _cachedAccessToken,
    );
  } else {
    headers = injectIntoRecord(
      (existingHeaders ?? {}) as Record<string, string>,
      _cachedDeviceId,
      _cachedAccessToken,
    );
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
