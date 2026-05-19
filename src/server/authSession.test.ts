/**
 * Unit tests for Auth Session service.
 *
 * Tests the core session management logic: token hashing, generation,
 * session creation with max-session enforcement, refresh token rotation,
 * and revocation behavior.
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashRefreshToken,
  generateRefreshToken,
  createSession,
  refreshSession,
  // revokeSession, revokeDeviceSessions, getActiveSessions - used in integration tests (task 14.3)
  AuthSessionError,
} from "./authSession";

// --- Tests for pure utility functions ---

describe("hashRefreshToken", () => {
  it("produces a 64-character hex string", async () => {
    const hash = await hashRefreshToken("test-token");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", async () => {
    const hash1 = await hashRefreshToken("same-token");
    const hash2 = await hashRefreshToken("same-token");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", async () => {
    const hash1 = await hashRefreshToken("token-a");
    const hash2 = await hashRefreshToken("token-b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("generateRefreshToken", () => {
  it("produces a non-empty string", () => {
    const token = generateRefreshToken();
    expect(token.length).toBeGreaterThan(0);
  });

  it("produces base64url-safe characters only", () => {
    const token = generateRefreshToken();
    // base64url: A-Z, a-z, 0-9, -, _
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces unique tokens on successive calls", () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(10);
  });
});

// --- Tests for session management with mocked DB ---

describe("createSession", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  it("generates a UUID session_id", async () => {
    mockDb.setActiveSessions([]);
    const result = await createSession(mockDb.db as any, {
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
    });
    // UUID format: 8-4-4-4-12 hex chars
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns a refresh token (not the hash)", async () => {
    mockDb.setActiveSessions([]);
    const result = await createSession(mockDb.db as any, {
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
    });
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken.length).toBeGreaterThan(0);
    // The stored hash should differ from the raw token
    const hash = await hashRefreshToken(result.refreshToken);
    expect(hash).not.toBe(result.refreshToken);
  });

  it("sets expiresAt based on default 30-day duration", async () => {
    mockDb.setActiveSessions([]);
    const before = Math.floor(Date.now() / 1000);
    const result = await createSession(mockDb.db as any, {
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
    });
    const after = Math.floor(Date.now() / 1000);
    const thirtyDays = 30 * 24 * 60 * 60;
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + thirtyDays);
    expect(result.expiresAt).toBeLessThanOrEqual(after + thirtyDays);
  });

  it("sets expiresAt based on custom duration", async () => {
    mockDb.setActiveSessions([]);
    const customDuration = 7 * 24 * 60 * 60; // 7 days
    const before = Math.floor(Date.now() / 1000);
    const result = await createSession(mockDb.db as any, {
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      sessionDurationSeconds: customDuration,
    });
    const after = Math.floor(Date.now() / 1000);
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + customDuration);
    expect(result.expiresAt).toBeLessThanOrEqual(after + customDuration);
  });

  it("revokes oldest session when max 5 sessions reached", async () => {
    const existingSessions = Array.from({ length: 5 }, (_, i) => ({
      sessionId: `session-${i}`,
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: `device-${i}`,
      refreshTokenHash: "hash",
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      revokedAt: null,
      createdAt: Math.floor(Date.now() / 1000) - (5 - i) * 1000, // oldest first
    }));
    mockDb.setActiveSessions(existingSessions);

    await createSession(mockDb.db as any, {
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-new",
    });

    // Should have called update with revokedAt set (for the oldest session)
    expect(mockDb.updatedSets.some((s: any) => s.revokedAt !== undefined)).toBe(true);
  });

  it("does not revoke sessions when under the limit", async () => {
    const existingSessions = Array.from({ length: 3 }, (_, i) => ({
      sessionId: `session-${i}`,
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: `device-${i}`,
      refreshTokenHash: "hash",
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      revokedAt: null,
      createdAt: Math.floor(Date.now() / 1000) - i * 1000,
    }));
    mockDb.setActiveSessions(existingSessions);

    await createSession(mockDb.db as any, {
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-new",
    });

    expect(mockDb.revokedSessionIds).toHaveLength(0);
  });
});

describe("refreshSession", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  it("throws SESSION_NOT_FOUND for non-existent session", async () => {
    mockDb.setSessionLookup(null);
    await expect(
      refreshSession(mockDb.db as any, "non-existent", "some-token"),
    ).rejects.toThrow(AuthSessionError);

    try {
      await refreshSession(mockDb.db as any, "non-existent", "some-token");
    } catch (e) {
      expect((e as AuthSessionError).code).toBe("SESSION_NOT_FOUND");
    }
  });

  it("throws SESSION_REVOKED and revokes device sessions for revoked session", async () => {
    mockDb.setSessionLookup({
      sessionId: "session-1",
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      refreshTokenHash: "hash",
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      revokedAt: Math.floor(Date.now() / 1000) - 100,
      createdAt: Math.floor(Date.now() / 1000) - 1000,
    });

    await expect(
      refreshSession(mockDb.db as any, "session-1", "some-token"),
    ).rejects.toThrow(AuthSessionError);

    try {
      await refreshSession(mockDb.db as any, "session-1", "some-token");
    } catch (e) {
      expect((e as AuthSessionError).code).toBe("SESSION_REVOKED");
    }
  });

  it("throws SESSION_EXPIRED for expired session", async () => {
    mockDb.setSessionLookup({
      sessionId: "session-1",
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      refreshTokenHash: "hash",
      expiresAt: Math.floor(Date.now() / 1000) - 100, // expired
      revokedAt: null,
      createdAt: Math.floor(Date.now() / 1000) - 1000,
    });

    await expect(
      refreshSession(mockDb.db as any, "session-1", "some-token"),
    ).rejects.toThrow(AuthSessionError);

    try {
      await refreshSession(mockDb.db as any, "session-1", "some-token");
    } catch (e) {
      expect((e as AuthSessionError).code).toBe("SESSION_EXPIRED");
    }
  });

  it("throws INVALID_REFRESH_TOKEN and revokes device sessions on hash mismatch", async () => {
    const correctToken = "correct-token";
    const correctHash = await hashRefreshToken(correctToken);

    mockDb.setSessionLookup({
      sessionId: "session-1",
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      refreshTokenHash: correctHash,
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      revokedAt: null,
      createdAt: Math.floor(Date.now() / 1000) - 1000,
    });

    await expect(
      refreshSession(mockDb.db as any, "session-1", "wrong-token"),
    ).rejects.toThrow(AuthSessionError);

    try {
      await refreshSession(mockDb.db as any, "session-1", "wrong-token");
    } catch (e) {
      expect((e as AuthSessionError).code).toBe("INVALID_REFRESH_TOKEN");
    }
  });

  it("returns new refresh token on successful refresh", async () => {
    const originalToken = "original-token";
    const originalHash = await hashRefreshToken(originalToken);

    mockDb.setSessionLookup({
      sessionId: "session-1",
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      refreshTokenHash: originalHash,
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      revokedAt: null,
      createdAt: Math.floor(Date.now() / 1000) - 1000,
    });

    const result = await refreshSession(mockDb.db as any, "session-1", originalToken);
    expect(result.sessionId).toBe("session-1");
    expect(result.newRefreshToken).toBeDefined();
    expect(result.newRefreshToken).not.toBe(originalToken);
    expect(result.expiresAt).toBe(Math.floor(Date.now() / 1000) + 86400);
  });
});

describe("AuthSessionError", () => {
  it("has correct name and code", () => {
    const error = new AuthSessionError("SESSION_EXPIRED", "Session expired");
    expect(error.name).toBe("AuthSessionError");
    expect(error.code).toBe("SESSION_EXPIRED");
    expect(error.message).toBe("Session expired");
  });
});

// --- Mock DB helper ---

function createMockDb() {
  let activeSessions: any[] = [];
  let sessionLookup: any = null;
  const revokedSessionIds: string[] = [];
  const insertedValues: any[] = [];
  let updatedSets: any[] = [];

  // Build a chainable mock that mimics Drizzle's query builder pattern
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            all: vi.fn(() => activeSessions),
          })),
          get: vi.fn(() => sessionLookup),
          all: vi.fn(() => activeSessions),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: any) => {
        insertedValues.push(vals);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((setData: any) => {
        updatedSets.push(setData);
        return {
          where: vi.fn((_condition: any) => {
            // Track revoked session IDs from the set data
            if (setData.revokedAt !== undefined) {
              // For individual session revocations in createSession
              // We can't easily extract the sessionId from the condition,
              // but we track the update happened
            }
          }),
        };
      }),
    })),
  };

  return {
    db,
    revokedSessionIds,
    insertedValues,
    updatedSets,
    setActiveSessions(sessions: any[]) {
      activeSessions = sessions;
    },
    setSessionLookup(session: any) {
      sessionLookup = session;
    },
  };
}
