import { checkDeviceBlockResponse, isDeviceBlocked } from "./deviceBlock";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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

  // Inject X-Device-Id header if a device ID is cached
  const mergedOptions = injectDeviceIdHeader(options);

  const response = await fetch(url, mergedOptions);

  // Check if this is a device_blocked response
  const wasBlocked = await checkDeviceBlockResponse(response, tenantId);
  if (wasBlocked) {
    throw new DeviceBlockedError("Device has been blocked by server");
  }

  return response;
}

/**
 * Merge the X-Device-Id header into the request options if a device ID is cached.
 * Preserves any existing headers provided by the caller.
 */
function injectDeviceIdHeader(options?: RequestInit): RequestInit | undefined {
  if (!_cachedDeviceId) return options;

  const existingHeaders = options?.headers;
  let headers: HeadersInit;

  if (existingHeaders instanceof Headers) {
    // Clone to avoid mutating the caller's Headers object
    headers = new Headers(existingHeaders);
    if (!headers.has("X-Device-Id")) {
      headers.set("X-Device-Id", _cachedDeviceId);
    }
  } else if (Array.isArray(existingHeaders)) {
    // Array of [key, value] pairs
    const hasDeviceId = existingHeaders.some(
      ([key]) => key.toLowerCase() === "x-device-id",
    );
    headers = hasDeviceId
      ? existingHeaders
      : [...existingHeaders, ["X-Device-Id", _cachedDeviceId]];
  } else {
    // Record<string, string> or undefined
    const record = (existingHeaders ?? {}) as Record<string, string>;
    const hasDeviceId = Object.keys(record).some(
      (key) => key.toLowerCase() === "x-device-id",
    );
    headers = hasDeviceId ? record : { ...record, "X-Device-Id": _cachedDeviceId };
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
