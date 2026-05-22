import { createMiddleware } from "hono/factory";
import { extractDeviceIdFromToken } from "../lib/tokenExtract";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

/**
 * Sliding window rate limiter for sync endpoints.
 *
 * Enforces 60 requests per minute per device_id using an in-memory
 * sliding window of request timestamps. Acceptable for single-instance
 * Cloudflare Workers where each isolate handles its own rate state.
 *
 * Requirements: 13.1, 13.2
 */

const WINDOW_MS = 60_000; // 60 seconds
const MAX_REQUESTS = 60;

// In-memory store: device_id → array of request timestamps (ms)
const requestLog = new Map<string, number[]>();

/**
 * Prunes timestamps older than the sliding window from the log.
 */
function pruneOldEntries(timestamps: number[], now: number): number[] {
  const windowStart = now - WINDOW_MS;
  return timestamps.filter((ts) => ts > windowStart);
}

/**
 * Calculates the Retry-After value in seconds.
 * Returns the number of seconds until the oldest request in the window expires,
 * clamped between 1 and 60 seconds.
 */
function calculateRetryAfter(timestamps: number[], now: number): number {
  if (timestamps.length === 0) return 1;
  const oldest = timestamps[0];
  const windowStart = now - WINDOW_MS;
  const secondsUntilSlot = Math.ceil((oldest - windowStart) / 1000);
  return Math.max(1, Math.min(60, secondsUntilSlot));
}

/**
 * Rate limiting middleware for sync endpoints.
 *
 * - Sliding window: 60 requests per 60 seconds per device_id
 * - Returns 429 with Retry-After header when limit exceeded
 * - Passes through if no device_id is present (backward compatibility)
 */
export const syncRateLimit = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const deviceId = extractDeviceIdFromToken(c.req.raw);

  // Skip rate limiting if no device_id present (backward compatibility)
  if (!deviceId) {
    await next();
    return;
  }

  const now = Date.now();

  // Get or initialize the request log for this device
  let timestamps = requestLog.get(deviceId) ?? [];

  // Prune entries outside the sliding window
  timestamps = pruneOldEntries(timestamps, now);

  // Check if rate limit is exceeded
  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfter = calculateRetryAfter(timestamps, now);
    requestLog.set(deviceId, timestamps);

    return c.json(
      { error: "rate_limit_exceeded", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // Record this request and proceed
  timestamps.push(now);
  requestLog.set(deviceId, timestamps);

  await next();
});
