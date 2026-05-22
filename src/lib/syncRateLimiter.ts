/**
 * Sync Rate Limiter — client-side rate limit state management.
 *
 * Tracks when the sync engine is paused due to a 429 response,
 * exposes query functions for the sync orchestrator to check before
 * starting a new cycle, and automatically clears the rate limit state
 * when the pause expires.
 *
 * Outbox entries remain "pending" during the pause — no modifications needed.
 * The actual 429 handling in individual requests is done in syncPush.ts and syncPull.ts;
 * this module provides higher-level coordination so the orchestrator can skip
 * triggering new sync cycles while rate-limited.
 *
 * @see Requirements 13.1, 13.2, 13.3, 13.4
 */

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum pause duration in milliseconds (120 seconds) */
export const MAX_PAUSE_MS = 120_000;

/** Maximum pause duration in seconds (120 seconds) */
export const MAX_PAUSE_SECONDS = 120;

// ── Types ──────────────────────────────────────────────────────────────

export interface RateLimitState {
  /** Whether the sync engine is currently rate-limited (paused) */
  rateLimited: boolean;
  /** Unix timestamp (ms) when the pause expires, or null if not rate-limited */
  pauseUntil: number | null;
}

// ── Singleton state ────────────────────────────────────────────────────

let _rateLimitState: RateLimitState = { rateLimited: false, pauseUntil: null };
let _resumeTimer: ReturnType<typeof setTimeout> | null = null;
let _onResume: (() => void) | null = null;
const _listeners: Set<(state: RateLimitState) => void> = new Set();

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get the current rate limit state.
 * Returns a copy to prevent external mutation.
 */
export function getRateLimitState(): RateLimitState {
  return { ..._rateLimitState };
}

/**
 * Check if the sync engine is currently rate-limited.
 * Automatically clears expired rate limits based on local clock.
 */
export function isRateLimited(): boolean {
  if (!_rateLimitState.rateLimited) return false;

  // Check if pause has expired based on local clock
  if (_rateLimitState.pauseUntil !== null && Date.now() >= _rateLimitState.pauseUntil) {
    clearRateLimitState();
    return false;
  }

  return true;
}

/**
 * Get the remaining milliseconds until the rate limit pause expires.
 * Returns 0 if not rate-limited or if the pause has already expired.
 * Useful for UI display of countdown.
 */
export function getRateLimitRemainingMs(): number {
  if (!_rateLimitState.rateLimited || _rateLimitState.pauseUntil === null) {
    return 0;
  }

  const remaining = _rateLimitState.pauseUntil - Date.now();
  return Math.max(0, remaining);
}

/**
 * Activate rate limiting after receiving a 429 response.
 *
 * @param retryAfterSeconds - The Retry-After header value in seconds.
 *   Capped at MAX_PAUSE_SECONDS (120s). Values ≤ 0 are treated as 1 second.
 */
export function activateRateLimit(retryAfterSeconds: number): void {
  // Clamp: minimum 1 second, maximum 120 seconds
  const clampedSeconds = Math.min(Math.max(retryAfterSeconds, 1), MAX_PAUSE_SECONDS);
  const pauseDurationMs = clampedSeconds * 1000;
  const pauseUntil = Date.now() + pauseDurationMs;

  _rateLimitState = { rateLimited: true, pauseUntil };
  notifyListeners();

  // Schedule automatic resume
  scheduleResume(pauseDurationMs);
}

/**
 * Clear the rate limit state manually (e.g., on user-initiated sync or reset).
 */
export function clearRateLimitState(): void {
  _rateLimitState = { rateLimited: false, pauseUntil: null };

  if (_resumeTimer) {
    clearTimeout(_resumeTimer);
    _resumeTimer = null;
  }

  notifyListeners();
}

/**
 * Subscribe to rate limit state changes. Returns an unsubscribe function.
 */
export function subscribeToRateLimit(
  listener: (state: RateLimitState) => void,
): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Register a callback to be invoked when the rate limit pause expires.
 * The sync orchestrator can use this to resume the push phase.
 */
export function onRateLimitResume(callback: () => void): void {
  _onResume = callback;
}

/**
 * Parse the Retry-After header value from a 429 response and activate rate limiting.
 * Handles both numeric seconds and missing/invalid header values.
 *
 * @param response - The 429 Response object
 * @returns true if rate limiting was activated, false if the response wasn't a 429
 */
export function handleRateLimitResponse(response: Response): boolean {
  if (response.status !== 429) return false;

  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfterSeconds = Number.parseInt(retryAfterHeader ?? "5", 10);

  // If parsing fails (NaN), default to 5 seconds
  const effectiveSeconds = Number.isNaN(retryAfterSeconds) ? 5 : retryAfterSeconds;

  activateRateLimit(effectiveSeconds);
  return true;
}

// ── Internal helpers ───────────────────────────────────────────────────

function notifyListeners(): void {
  const state = getRateLimitState();
  for (const listener of _listeners) {
    try {
      listener(state);
    } catch {
      // Don't let listener errors break the notification loop
    }
  }
}

function scheduleResume(delayMs: number): void {
  if (_resumeTimer) {
    clearTimeout(_resumeTimer);
    _resumeTimer = null;
  }

  _resumeTimer = setTimeout(() => {
    _resumeTimer = null;
    _rateLimitState = { rateLimited: false, pauseUntil: null };
    notifyListeners();

    // Trigger resume callback (sync orchestrator can restart push phase)
    if (_onResume) {
      _onResume();
    }
  }, delayMs);
}
