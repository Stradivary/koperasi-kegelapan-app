import { eq, and, isNull, gt, asc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { authSessions } from "#/db/schema";
import type { AuthSession } from "#/db/schema";

/** Maximum concurrent sessions allowed per account within a tenant. */
const MAX_SESSIONS_PER_ACCOUNT = 5;

/** Default session duration: 30 days in seconds. */
const DEFAULT_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

/**
 * Hash a refresh token using SHA-256 via Web Crypto API.
 * Returns a 64-character hex string.
 */
export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a cryptographically random refresh token.
 * Returns a base64url-encoded string from 32 random bytes.
 */
export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Convert to base64url
  const base64 = btoa(String.fromCodePoint(...bytes));
  return base64.replaceAll('+', "-").replaceAll('/', "_").replaceAll(/=+$/, "");
}

export interface CreateSessionInput {
  tenantId: string;
  accountId: string;
  deviceId: string;
  /** Session duration in seconds. Defaults to 30 days. Must be between 1 day and 90 days. */
  sessionDurationSeconds?: number;
}

export interface CreateSessionResult {
  sessionId: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Create a new auth session bound to a specific device.
 *
 * - Generates a session_id (UUID) and a refresh token
 * - Stores the SHA-256 hash of the refresh token (never the raw token)
 * - Enforces max 5 concurrent sessions per account: revokes the oldest
 *   (by created_at) session if the limit is exceeded
 * - Returns the session_id, raw refresh token (for client), and expiry
 */
export async function createSession(
  db: DrizzleD1Database<Record<string, unknown>>,
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const now = Math.floor(Date.now() / 1000);
  const duration = input.sessionDurationSeconds ?? DEFAULT_SESSION_DURATION_SECONDS;
  const expiresAt = now + duration;

  // Generate session ID and refresh token
  const sessionId = crypto.randomUUID();
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashRefreshToken(refreshToken);

  // Check current active session count for this account+tenant
  const activeSessions = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tenantId, input.tenantId),
        eq(authSessions.accountId, input.accountId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .orderBy(asc(authSessions.createdAt))
    .all();

  // If at or over the limit, revoke the oldest (LRU by created_at) sessions
  if (activeSessions.length >= MAX_SESSIONS_PER_ACCOUNT) {
    const sessionsToRevoke = activeSessions.slice(
      0,
      activeSessions.length - MAX_SESSIONS_PER_ACCOUNT + 1,
    );
    for (const session of sessionsToRevoke) {
      await db
        .update(authSessions)
        .set({ revokedAt: now })
        .where(eq(authSessions.sessionId, session.sessionId));
    }
  }

  // Insert the new session
  await db.insert(authSessions).values({
    sessionId,
    tenantId: input.tenantId,
    accountId: input.accountId,
    deviceId: input.deviceId,
    refreshTokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  });

  return { sessionId, refreshToken, expiresAt };
}

export interface RefreshSessionResult {
  sessionId: string;
  newRefreshToken: string;
  expiresAt: number;
}

/**
 * Refresh a session by verifying the current refresh token and rotating it.
 *
 * - Verifies the token hash matches the stored refresh_token_hash
 * - Checks the session is not expired or revoked
 * - Generates a new refresh token and updates the hash in the DB
 * - Returns the new refresh token
 *
 * If verification fails (hash mismatch or session is revoked), revokes ALL
 * sessions for that device and throws an error requiring re-authentication.
 */
export async function refreshSession(
  db: DrizzleD1Database<Record<string, unknown>>,
  sessionId: string,
  currentRefreshToken: string,
): Promise<RefreshSessionResult> {
  const now = Math.floor(Date.now() / 1000);

  // Look up the session
  const session = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.sessionId, sessionId))
    .get();

  if (!session) {
    throw new AuthSessionError("SESSION_NOT_FOUND", "Session does not exist");
  }

  // Check if session is revoked
  if (session.revokedAt !== null) {
    // Revoke all sessions for this device (compromised token reuse)
    await revokeAllDeviceSessions(db, session.deviceId);
    throw new AuthSessionError(
      "SESSION_REVOKED",
      "Session has been revoked. All device sessions invalidated. Re-authentication required.",
    );
  }

  // Check if session is expired
  if (session.expiresAt <= now) {
    throw new AuthSessionError("SESSION_EXPIRED", "Session has expired. Re-authentication required.");
  }

  // Verify the refresh token hash
  const providedHash = await hashRefreshToken(currentRefreshToken);
  if (providedHash !== session.refreshTokenHash) {
    // Hash mismatch — potential token compromise. Revoke all device sessions.
    await revokeAllDeviceSessions(db, session.deviceId);
    throw new AuthSessionError(
      "INVALID_REFRESH_TOKEN",
      "Refresh token verification failed. All device sessions invalidated. Re-authentication required.",
    );
  }

  // Rotate: generate new refresh token and update hash
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);

  await db
    .update(authSessions)
    .set({ refreshTokenHash: newRefreshTokenHash })
    .where(eq(authSessions.sessionId, sessionId));

  return {
    sessionId,
    newRefreshToken,
    expiresAt: session.expiresAt,
  };
}

/**
 * Revoke a single session by setting revoked_at.
 */
export async function revokeSession(
  db: DrizzleD1Database<Record<string, unknown>>,
  sessionId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(eq(authSessions.sessionId, sessionId));
}

/**
 * Revoke all active (non-revoked, non-expired) sessions for a specific device.
 *
 * @returns The number of sessions revoked
 */
export async function revokeDeviceSessions(
  db: DrizzleD1Database<Record<string, unknown>>,
  deviceId: string,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  const activeSessions = await db
    .select({ sessionId: authSessions.sessionId })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.deviceId, deviceId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .all();

  if (activeSessions.length === 0) {
    return 0;
  }

  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.deviceId, deviceId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    );

  return activeSessions.length;
}

/**
 * Get all active (non-revoked, non-expired) sessions for an account within a tenant.
 */
export async function getActiveSessions(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
  accountId: string,
): Promise<AuthSession[]> {
  const now = Math.floor(Date.now() / 1000);

  return db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tenantId, tenantId),
        eq(authSessions.accountId, accountId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .all();
}

// --- Internal helpers ---

/**
 * Revoke all active sessions for a device. Used internally when
 * a compromised/invalid refresh token is detected.
 */
async function revokeAllDeviceSessions(
  db: DrizzleD1Database<Record<string, unknown>>,
  deviceId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.deviceId, deviceId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    );
}

// --- Error types ---

export type AuthSessionErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "SESSION_EXPIRED"
  | "INVALID_REFRESH_TOKEN";

export class AuthSessionError extends Error {
  public readonly code: AuthSessionErrorCode;

  constructor(code: AuthSessionErrorCode, message: string) {
    super(message);
    this.name = "AuthSessionError";
    this.code = code;
  }
}
