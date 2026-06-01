/**
 * Tests for src/lib/localSessionGrant.ts
 * Covers: issueLocalSessionGrant, issueAndCacheLocalSessionGrant,
 *         getOrIssueLocalSessionGrant (cache hit, cache miss, expired, error paths)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock indexeddb.lazy ───────────────────────────────────────────────────────

const mockPut = vi.fn();
const mockGet = vi.fn();
const mockSessionGrantCacheStore = { put: mockPut, get: mockGet };
const mockGetSessionGrantCacheStore = vi.fn().mockResolvedValue(mockSessionGrantCacheStore);

vi.mock("#/lib/indexeddb.lazy", () => ({
  getSessionGrantCacheStore: () => mockGetSessionGrantCacheStore(),
}));

// ── Mock roleOps ──────────────────────────────────────────────────────────────

vi.mock("#/lib/roleOps", () => ({
  roleToOps: (role: string) => {
    if (role === "admin") return ["read", "write", "admin"];
    if (role === "terminal") return ["read", "debit"];
    return ["read"];
  },
}));

import {
  issueLocalSessionGrant,
  issueAndCacheLocalSessionGrant,
  getOrIssueLocalSessionGrant,
} from "#/lib/localSessionGrant";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("issueLocalSessionGrant", () => {
  it("returns a SessionGrant with correct tenantId, accountId, deviceId", async () => {
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
    expect(grant.accountId).toBe("acc-1");
    expect(grant.deviceId).toBe("dev-1");
  });

  it("returns keyVersion 1 by default", async () => {
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.keyVersion).toBe(1);
  });

  it("returns custom keyVersion when provided", async () => {
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin", 3);
    expect(grant.keyVersion).toBe(3);
  });

  it("returns sessionKey as Uint8Array of 32 bytes", async () => {
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.sessionKey).toBeInstanceOf(Uint8Array);
    expect(grant.sessionKey.length).toBe(32);
  });

  it("returns signature as Uint8Array of 32 bytes", async () => {
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.signature).toBeInstanceOf(Uint8Array);
    expect(grant.signature.length).toBe(32);
  });

  it("returns expiresAt ~24h in the future", async () => {
    const before = Math.floor(Date.now() / 1000);
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    const after = Math.floor(Date.now() / 1000);
    expect(grant.expiresAt).toBeGreaterThanOrEqual(before + 86400 - 1);
    expect(grant.expiresAt).toBeLessThanOrEqual(after + 86400 + 1);
  });

  it("returns allowedOps from roleToOps", async () => {
    const grant = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.allowedOps).toEqual(["read", "write", "admin"]);
  });

  it("produces different sessionKeys for different tenants", async () => {
    const g1 = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    const g2 = await issueLocalSessionGrant("t-2", "acc-1", "dev-1", "admin");
    expect(g1.sessionKey).not.toEqual(g2.sessionKey);
  });

  it("produces different sessionKeys for different keyVersions", async () => {
    const g1 = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin", 1);
    const g2 = await issueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin", 2);
    expect(g1.sessionKey).not.toEqual(g2.sessionKey);
  });
});

describe("issueAndCacheLocalSessionGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
  });

  it("returns a valid SessionGrant", async () => {
    const grant = await issueAndCacheLocalSessionGrant("t-1", "acc-1", "dev-1", "terminal");
    expect(grant.tenantId).toBe("t-1");
    expect(grant.sessionKey).toBeInstanceOf(Uint8Array);
  });

  it("calls sessionGrantCacheStore.put with correct shape", async () => {
    await issueAndCacheLocalSessionGrant("t-1", "acc-1", "dev-1", "terminal");
    expect(mockPut).toHaveBeenCalledOnce();
    const cached = mockPut.mock.calls[0][0];
    expect(cached.tenantId).toBe("t-1");
    expect(cached.accountId).toBe("acc-1");
    expect(cached.deviceId).toBe("dev-1");
    expect(typeof cached.sessionKeyB64).toBe("string");
    expect(typeof cached.signatureB64).toBe("string");
    expect(typeof cached.cachedAt).toBe("number");
  });

  it("still returns grant even when cache put fails", async () => {
    mockPut.mockRejectedValue(new Error("IndexedDB quota exceeded"));
    const grant = await issueAndCacheLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
  });

  it("still returns grant when getSessionGrantCacheStore fails", async () => {
    mockGetSessionGrantCacheStore.mockRejectedValueOnce(new Error("DB unavailable"));
    const grant = await issueAndCacheLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
  });
});

describe("getOrIssueLocalSessionGrant - cache hit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
  });

  it("returns cached grant when valid and not expired", async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    mockGet.mockResolvedValue({
      tenantId: "t-1",
      accountId: "acc-1",
      deviceId: "dev-1",
      keyVersion: 1,
      sessionKeyB64: btoa("a".repeat(32)),
      expiresAt: futureExpiry,
      allowedOps: ["read"],
      signatureB64: btoa("b".repeat(32)),
    });

    const grant = await getOrIssueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
    expect(grant.expiresAt).toBe(futureExpiry);
    // Should NOT have called put (no new grant issued)
    expect(mockPut).not.toHaveBeenCalled();
  });
});

describe("getOrIssueLocalSessionGrant - cache miss / expired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
  });

  it("issues fresh grant when cache returns null", async () => {
    mockGet.mockResolvedValue(null);
    const grant = await getOrIssueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it("issues fresh grant when cached grant is expired", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 1;
    mockGet.mockResolvedValue({
      tenantId: "t-1",
      accountId: "acc-1",
      deviceId: "dev-1",
      keyVersion: 1,
      sessionKeyB64: btoa("a".repeat(32)),
      expiresAt: pastExpiry,
      allowedOps: ["read"],
      signatureB64: btoa("b".repeat(32)),
    });
    const grant = await getOrIssueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    // Fresh grant should have future expiry
    expect(grant.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it("issues fresh grant when cache read throws", async () => {
    mockGet.mockRejectedValue(new Error("IndexedDB error"));
    const grant = await getOrIssueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
    expect(mockPut).toHaveBeenCalledOnce();
  });

  it("issues fresh grant when getSessionGrantCacheStore throws on read", async () => {
    mockGetSessionGrantCacheStore
      .mockRejectedValueOnce(new Error("DB unavailable"))
      .mockResolvedValue(mockSessionGrantCacheStore);
    const grant = await getOrIssueLocalSessionGrant("t-1", "acc-1", "dev-1", "admin");
    expect(grant.tenantId).toBe("t-1");
  });
});
