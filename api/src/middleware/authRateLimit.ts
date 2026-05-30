/**
 * Rate limiting middleware for authentication endpoints.
 *
 * Prevents brute-force credential stuffing by limiting failed login attempts.
 * Uses a sliding window of 5 attempts per 15 minutes, keyed by username.
 *
 * Design decisions:
 * - Keyed by username (not IP) because Cloudflare Workers don't reliably
 *   expose client IPs, and username-based limiting is more effective against
 *   distributed attacks targeting a single account.
 * - In-memory store: acceptable for single-instance Workers. Resets on
 *   isolate restart, which is a minor trade-off for simplicity.
 * - Only counts FAILED attempts. Successful logins reset the counter.
 */

import { createMiddleware } from "hono/factory";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface AttemptRecord {
  timestamps: number[];
  /** Track if the last response was a rate limit (to avoid double-counting) */
  blocked: boolean;
}

// In-memory store: username → attempt timestamps
const attemptLog = new Map<string, AttemptRecord>();

/**
 * Prune timestamps older than the sliding window.
 */
function pruneOld(timestamps: number[], now: number): number[] {
  const windowStart = now - WINDOW_MS;
  return timestamps.filter((ts) => ts > windowStart);
}

/**
 * Calculate Retry-After in seconds.
 */
function calculateRetryAfter(timestamps: number[], now: number): number {
  if (timestamps.length === 0) return 1;
  const oldest = timestamps[0];
  const windowStart = now - WINDOW_MS;
  const seconds = Math.ceil((oldest - windowStart) / 1000);
  return Math.max(1, Math.min(900, seconds)); // 1s to 15min
}

/**
 * Pre-request rate limit check for auth endpoints.
 *
 * Reads the username from the request body (JSON) and checks if the
 * account has exceeded the attempt limit. If so, returns 429.
 *
 * IMPORTANT: This middleware clones the request body so downstream
 * handlers can still read it.
 */
export const authRateLimit = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // Only apply to POST requests (login attempts)
  if (c.req.method !== "POST") {
    await next();
    return;
  }

  // Parse body to extract username for rate limit key
  let username: string | null = null;
  try {
    const body = await c.req.json();
    username = body?.username?.toLowerCase?.() ?? null;
    // Store parsed body for downstream use (avoid double-parsing)
    c.set("parsedBody" as never, body);
  } catch {
    // If body can't be parsed, let the route handler deal with it
    await next();
    return;
  }

  if (!username) {
    await next();
    return;
  }

  const now = Date.now();
  const record = attemptLog.get(username) ?? { timestamps: [], blocked: false };
  record.timestamps = pruneOld(record.timestamps, now);

  // Check if rate limit exceeded
  if (record.timestamps.length >= MAX_ATTEMPTS) {
    const retryAfter = calculateRetryAfter(record.timestamps, now);
    record.blocked = true;
    attemptLog.set(username, record);

    return c.json(
      { error: "Too many login attempts. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  await next();

  // After the response: record failed attempts, clear on success
  const status = c.res.status;
  if (status === 401) {
    // Failed login — record the attempt
    record.timestamps.push(now);
    record.blocked = false;
    attemptLog.set(username, record);
  } else if (status === 200) {
    // Successful login — reset the counter
    attemptLog.delete(username);
  }
});

/**
 * Reset rate limit for a specific username.
 * Exported for testing purposes.
 */
export function resetAuthRateLimit(username: string): void {
  attemptLog.delete(username.toLowerCase());
}

/**
 * Clear all rate limit records.
 * Exported for testing purposes.
 */
export function clearAllAuthRateLimits(): void {
  attemptLog.clear();
}
