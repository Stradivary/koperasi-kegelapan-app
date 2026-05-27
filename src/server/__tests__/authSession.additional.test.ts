/**
 * Additional tests for authSession.ts covering uncovered lines 205-264:
 * - revokeSession
 * - revokeDeviceSessions
 * - getActiveSessions
 */

import { describe, it, expect, vi } from "vitest";
import { revokeSession, revokeDeviceSessions, getActiveSessions } from "../authSession";

// ── Mock DB builder ────────────────────────────────────────────────────

function createMockDb(activeSessions: unknown[] = []) {
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectAll = vi.fn().mockResolvedValue(activeSessions);
  const selectWhere = vi.fn(() => ({ all: selectAll }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    db: { update, select } as unknown as Parameters<typeof revokeSession>[0],
    updateWhere,
    updateSet,
    update,
    selectAll,
  };
}

describe("revokeSession", () => {
  it("calls update with revokedAt set", async () => {
    const { db, updateWhere } = createMockDb();
    await revokeSession(db, "session-abc");
    expect(updateWhere).toHaveBeenCalled();
  });

  it("does not throw on success", async () => {
    const { db } = createMockDb();
    await expect(revokeSession(db, "session-xyz")).resolves.toBeUndefined();
  });
});

describe("revokeDeviceSessions", () => {
  it("returns 0 when no active sessions exist", async () => {
    const { db } = createMockDb([]);
    const count = await revokeDeviceSessions(db, "device-1");
    expect(count).toBe(0);
  });

  it("returns the count of revoked sessions", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sessions = [
      { sessionId: "s1", deviceId: "device-1", revokedAt: null, expiresAt: now + 3600 },
      { sessionId: "s2", deviceId: "device-1", revokedAt: null, expiresAt: now + 7200 },
    ];
    const { db } = createMockDb(sessions);
    const count = await revokeDeviceSessions(db, "device-1");
    expect(count).toBe(2);
  });

  it("calls update when sessions exist", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sessions = [
      { sessionId: "s1", deviceId: "device-1", revokedAt: null, expiresAt: now + 3600 },
    ];
    const { db, updateSet } = createMockDb(sessions);
    await revokeDeviceSessions(db, "device-1");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Number) }),
    );
  });
});

describe("getActiveSessions", () => {
  it("returns empty array when no active sessions", async () => {
    const { db } = createMockDb([]);
    const sessions = await getActiveSessions(db, "tenant-1", "account-1");
    expect(sessions).toEqual([]);
  });

  it("returns active sessions", async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockSessions = [
      {
        sessionId: "s1",
        tenantId: "tenant-1",
        accountId: "account-1",
        deviceId: "device-1",
        refreshTokenHash: "hash",
        expiresAt: now + 3600,
        revokedAt: null,
        createdAt: now - 100,
      },
    ];
    const { db } = createMockDb(mockSessions);
    const sessions = await getActiveSessions(db, "tenant-1", "account-1");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("s1");
  });
});
