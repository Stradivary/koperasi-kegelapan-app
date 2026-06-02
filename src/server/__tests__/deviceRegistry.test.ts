/**
 * Tests for src/server/deviceRegistry.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drizzle-orm/d1 and schema
vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn() }));
vi.mock("#/infrastructure/persistence/drizzle/schema", () => ({
  devices: {},
  authSessions: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  isNull: vi.fn((a) => ({ isNull: a })),
  gt: vi.fn((a, b) => ({ gt: [a, b] })),
}));

import {
  registerDevice,
  getDevicesByAccount,
  getDevicesByTenant,
  blockDevice,
  unblockDevice,
  isDeviceBlocked,
  revokeDeviceSessions,
} from "../deviceRegistry";

function makeDb(overrides: Record<string, unknown> = {}) {
  const base = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    ...overrides,
  };
  return base as unknown as Parameters<typeof registerDevice>[0];
}

describe("registerDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new device when none exists", async () => {
    const db = makeDb();
    (db as unknown as { get: ReturnType<typeof vi.fn> }).get.mockResolvedValue(undefined);

    const result = await registerDevice(db, {
      tenantId: "t-1",
      accountId: "a-1",
      fingerprintHash: "fp-hash",
      userAgent: "Mozilla/5.0",
      platform: "Win32",
    });

    expect(result.tenantId).toBe("t-1");
    expect(result.accountId).toBe("a-1");
    expect(result.fingerprintHash).toBe("fp-hash");
    expect(result.deviceId).toBeTruthy();
    expect(typeof result.deviceId).toBe("string");
  });

  it("updates and returns existing device when fingerprint matches", async () => {
    const existingDevice = {
      deviceId: "existing-device-id",
      tenantId: "t-1",
      accountId: "a-1",
      fingerprintHash: "fp-hash",
      userAgent: "OldAgent",
      platform: "Linux",
      lastSeenAt: 1000,
      blockedUntil: null,
      createdAt: 1000,
    };
    const db = makeDb();
    (db as unknown as { get: ReturnType<typeof vi.fn> }).get.mockResolvedValue(existingDevice);

    const result = await registerDevice(db, {
      tenantId: "t-1",
      accountId: "a-1",
      fingerprintHash: "fp-hash",
      userAgent: "NewAgent",
      platform: "Win32",
    });

    expect(result.deviceId).toBe("existing-device-id");
    expect(result.userAgent).toBe("NewAgent");
    expect(result.platform).toBe("Win32");
  });
});

describe("getDevicesByAccount", () => {
  it("returns devices for a given account", async () => {
    const mockDevices = [{ deviceId: "d-1" }, { deviceId: "d-2" }];
    const db = makeDb();
    (db as unknown as { all: ReturnType<typeof vi.fn> }).all.mockResolvedValue(mockDevices);

    const result = await getDevicesByAccount(db, "t-1", "a-1");
    expect(result).toEqual(mockDevices);
  });
});

describe("getDevicesByTenant", () => {
  it("returns all devices for a tenant", async () => {
    const mockDevices = [{ deviceId: "d-1" }];
    const db = makeDb();
    (db as unknown as { all: ReturnType<typeof vi.fn> }).all.mockResolvedValue(mockDevices);

    const result = await getDevicesByTenant(db, "t-1");
    expect(result).toEqual(mockDevices);
  });
});

describe("blockDevice", () => {
  it("sets blockedUntil to now + durationSeconds", async () => {
    const db = makeDb();
    const setMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockResolvedValue(undefined);
    (db as unknown as { update: ReturnType<typeof vi.fn> }).update.mockReturnValue({
      set: setMock,
    });
    setMock.mockReturnValue({ where: whereMock });

    await blockDevice(db, "device-1", 3600);

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ blockedUntil: expect.any(Number) }),
    );
  });
});

describe("unblockDevice", () => {
  it("sets blockedUntil to null", async () => {
    const db = makeDb();
    const setMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockResolvedValue(undefined);
    (db as unknown as { update: ReturnType<typeof vi.fn> }).update.mockReturnValue({
      set: setMock,
    });
    setMock.mockReturnValue({ where: whereMock });

    await unblockDevice(db, "device-1");

    expect(setMock).toHaveBeenCalledWith({ blockedUntil: null });
  });
});

describe("isDeviceBlocked", () => {
  it("returns false when device not found", async () => {
    const db = makeDb();
    (db as unknown as { get: ReturnType<typeof vi.fn> }).get.mockResolvedValue(undefined);

    const result = await isDeviceBlocked(db, "device-1");
    expect(result).toBe(false);
  });

  it("returns true when blockedUntil is in the future", async () => {
    const db = makeDb();
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    (db as unknown as { get: ReturnType<typeof vi.fn> }).get.mockResolvedValue({
      blockedUntil: futureTime,
    });

    const result = await isDeviceBlocked(db, "device-1");
    expect(result).toBe(true);
  });

  it("returns false when blockedUntil is in the past", async () => {
    const db = makeDb();
    const pastTime = Math.floor(Date.now() / 1000) - 3600;
    (db as unknown as { get: ReturnType<typeof vi.fn> }).get.mockResolvedValue({
      blockedUntil: pastTime,
    });

    const result = await isDeviceBlocked(db, "device-1");
    expect(result).toBe(false);
  });

  it("returns false when blockedUntil is null", async () => {
    const db = makeDb();
    (db as unknown as { get: ReturnType<typeof vi.fn> }).get.mockResolvedValue({
      blockedUntil: null,
    });

    const result = await isDeviceBlocked(db, "device-1");
    expect(result).toBe(false);
  });
});

describe("revokeDeviceSessions", () => {
  it("returns 0 when no active sessions", async () => {
    const db = makeDb();
    (db as unknown as { all: ReturnType<typeof vi.fn> }).all.mockResolvedValue([]);

    const result = await revokeDeviceSessions(db, "device-1");
    expect(result).toBe(0);
  });

  it("revokes active sessions and returns count", async () => {
    const db = makeDb();
    const activeSessions = [{ sessionId: "s-1" }, { sessionId: "s-2" }];
    (db as unknown as { all: ReturnType<typeof vi.fn> }).all.mockResolvedValue(activeSessions);

    const setMock = vi.fn().mockReturnThis();
    const whereMock = vi.fn().mockResolvedValue(undefined);
    (db as unknown as { update: ReturnType<typeof vi.fn> }).update.mockReturnValue({
      set: setMock,
    });
    setMock.mockReturnValue({ where: whereMock });

    const result = await revokeDeviceSessions(db, "device-1");
    expect(result).toBe(2);
  });
});
