// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSessionGrantCacheStorePut = vi.fn();
const mockSessionGrantCacheStoreGet = vi.fn();

vi.mock("./indexeddb", () => ({
  sessionGrantCacheStore: {
    put: (...args: unknown[]) => mockSessionGrantCacheStorePut(...args),
    get: (...args: unknown[]) => mockSessionGrantCacheStoreGet(...args),
  },
}));

vi.mock("#/infrastructure/persistence/dexie/indexeddb", () => ({
  sessionGrantCacheStore: {
    put: (...args: unknown[]) => mockSessionGrantCacheStorePut(...args),
    get: (...args: unknown[]) => mockSessionGrantCacheStoreGet(...args),
  },
}));

vi.mock("#/core/auth/roleOps", () => ({
  roleToOps: (role: string) => {
    if (role === "admin") return ["read", "debit", "credit", "admin"];
    if (role === "gate") return ["read", "checkin"];
    return ["read"];
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionGrantCacheStorePut.mockResolvedValue(undefined);
  mockSessionGrantCacheStoreGet.mockResolvedValue(null);
});

describe("issueLocalSessionGrant", () => {
  it("returns a grant with all required fields", async () => {
    const { issueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");

    expect(grant.keyVersion).toBe(1);
    expect(grant.sessionKey).toBeInstanceOf(Uint8Array);
    expect(grant.sessionKey.length).toBe(32);
    expect(grant.signature).toBeInstanceOf(Uint8Array);
    expect(grant.signature.length).toBe(32);
    expect(grant.tenantId).toBe("tenant-1");
    expect(grant.accountId).toBe("account-1");
    expect(grant.deviceId).toBe("device-1");
    expect(Array.isArray(grant.allowedOps)).toBe(true);
  });

  it("expiresAt is approximately 24 hours from now", async () => {
    const { issueLocalSessionGrant } = await import("../localSessionGrant");
    const before = Math.floor(Date.now() / 1000);
    const grant = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");
    const after = Math.floor(Date.now() / 1000);

    expect(grant.expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 - 2);
    expect(grant.expiresAt).toBeLessThanOrEqual(after + 24 * 60 * 60 + 2);
  });

  it("uses provided keyVersion", async () => {
    const { issueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin", 3);
    expect(grant.keyVersion).toBe(3);
  });

  it("produces same sessionKey for same tenant (deterministic)", async () => {
    const { issueLocalSessionGrant } = await import("../localSessionGrant");
    const g1 = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");
    const g2 = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");
    expect(g1.sessionKey).toEqual(g2.sessionKey);
  });

  it("produces different sessionKeys for different tenants", async () => {
    const { issueLocalSessionGrant } = await import("../localSessionGrant");
    const g1 = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");
    const g2 = await issueLocalSessionGrant("tenant-2", "account-1", "device-1", "admin");
    expect(g1.sessionKey).not.toEqual(g2.sessionKey);
  });

  it("allowedOps comes from roleToOps", async () => {
    const { issueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await issueLocalSessionGrant("tenant-1", "account-1", "device-1", "gate");
    expect(grant.allowedOps).toEqual(["read", "checkin"]);
  });
});

describe("issueAndCacheLocalSessionGrant", () => {
  it("returns a valid grant", async () => {
    const { issueAndCacheLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await issueAndCacheLocalSessionGrant(
      "tenant-1",
      "account-1",
      "device-1",
      "admin",
    );
    expect(grant.tenantId).toBe("tenant-1");
    expect(grant.sessionKey).toBeInstanceOf(Uint8Array);
  });

  it("caches the grant to IndexedDB", async () => {
    const { issueAndCacheLocalSessionGrant } = await import("../localSessionGrant");
    await issueAndCacheLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");
    expect(mockSessionGrantCacheStorePut).toHaveBeenCalledOnce();
  });

  it("still returns grant even if cache put fails", async () => {
    mockSessionGrantCacheStorePut.mockRejectedValue(new Error("IndexedDB error"));
    const { issueAndCacheLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await issueAndCacheLocalSessionGrant(
      "tenant-1",
      "account-1",
      "device-1",
      "admin",
    );
    expect(grant.tenantId).toBe("tenant-1");
  });
});

describe("getOrIssueLocalSessionGrant", () => {
  it("returns cached grant when valid cache exists", async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    mockSessionGrantCacheStoreGet.mockResolvedValue({
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      keyVersion: 1,
      sessionKeyB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      expiresAt: futureExpiry,
      allowedOps: ["read"],
      signatureB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });

    const { getOrIssueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await getOrIssueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");

    expect(grant.tenantId).toBe("tenant-1");
    expect(grant.expiresAt).toBe(futureExpiry);
    // Should NOT have called put (used cache)
    expect(mockSessionGrantCacheStorePut).not.toHaveBeenCalled();
  });

  it("issues fresh grant when cache is expired", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 100;
    mockSessionGrantCacheStoreGet.mockResolvedValue({
      tenantId: "tenant-1",
      accountId: "account-1",
      deviceId: "device-1",
      keyVersion: 1,
      sessionKeyB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      expiresAt: pastExpiry,
      allowedOps: ["read"],
      signatureB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });

    const { getOrIssueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await getOrIssueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");

    // Should have issued a fresh grant (expiresAt > pastExpiry)
    expect(grant.expiresAt).toBeGreaterThan(pastExpiry);
    expect(mockSessionGrantCacheStorePut).toHaveBeenCalled();
  });

  it("issues fresh grant when cache is null", async () => {
    mockSessionGrantCacheStoreGet.mockResolvedValue(null);

    const { getOrIssueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await getOrIssueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");

    expect(grant.tenantId).toBe("tenant-1");
    expect(mockSessionGrantCacheStorePut).toHaveBeenCalled();
  });

  it("issues fresh grant when cache read throws", async () => {
    mockSessionGrantCacheStoreGet.mockRejectedValue(new Error("DB error"));

    const { getOrIssueLocalSessionGrant } = await import("../localSessionGrant");
    const grant = await getOrIssueLocalSessionGrant("tenant-1", "account-1", "device-1", "admin");

    expect(grant.tenantId).toBe("tenant-1");
  });
});
