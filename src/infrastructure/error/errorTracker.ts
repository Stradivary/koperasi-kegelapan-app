/**
 * Client-side error tracker — sends structured error events to the backend
 * for monitoring NFC write failures and other critical client errors.
 *
 * Fire-and-forget: never throws, never blocks the UI.
 */

import { API_BASE_URL, getCurrentDeviceId, getAccessToken } from "#/infrastructure/api/apiClient";

export interface ErrorEvent {
  /** Error category (e.g. "nfc_write_failure", "nfc_session_expired") */
  category: string;
  /** Human-readable error message */
  message: string;
  /** Additional structured context */
  context?: Record<string, string | number | boolean | null>;
}

/**
 * Report a client error event to the backend tracker endpoint.
 * This is fire-and-forget — it will never throw or block the caller.
 */
export function trackError(event: ErrorEvent): void {
  try {
    const deviceId = getCurrentDeviceId();
    const token = getAccessToken();

    const payload = {
      category: event.category,
      message: event.message,
      context: event.context ?? {},
      deviceId: deviceId ?? "unknown",
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (deviceId) {
      headers["X-Device-Id"] = deviceId;
    }

    // Fire-and-forget — no await, no .catch that rethrows
    fetch(`${API_BASE_URL}/api/client-errors`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore — error tracking must never break the app
    });
  } catch {
    // Silently ignore
  }
}
