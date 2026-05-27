/**
 * Tests for src/lib/localTenant.ts
 *
 * Covers:
 * - localLoginWithReason: success, wrong_credentials, wrong_tenant, inactive
 * - localLogin: delegates to localLoginWithReason
 * - isLocalSlugTaken / isRemoteSlugTaken / isSlugTaken
 * - setupLocalTenant: happy path, duplicate slug, invalid slug
 * - cacheServerCredentials: new account, existing account, new/existing config
 * - hasLocalTenant
 * - exportTenant / importTenant
 * - downloadExportBlob
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLocalAccountStoreGetByUsername = vi.fn();
const mockLocalAccountStoreGetByTenant = vi.fn();
const mockLocalAccountStorePut = vi.fn();
const mockLocalTenantConfigStoreGetAll = vi.fn();
const mockLocalTenantConfigStoreGet = vi.fn();
const mockLocalTenantConfigStorePut = vi.fn();

vi.mock("#/lib/indexeddb", () => ({
  localAccountStore: {
    getByUsername: (...args: unknown[]) => mockLocalAccountStoreGetByUsername(...args),
    getByTenant: (...args: unknown[]) => mockLocalAccountStoreGetByTenant(...args),
    put: (...args: unknown[]) => mockLocalAccountStorePut(...args),
  },
  localTenantConfigStore: {
    getAll: () => mockLocalTenantConfigStoreGetAll(),
    get: (...args: unknown[]) => mockLocalTenantConfigStoreGet(...args),
    put: (...args: unknown[]) => mockLocalTenantConfigStorePut(...args),
  },
}));

vi.mock("#/lib/slugValidation", () => ({
  createSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
  validateSlugFormat: (slug: string) => {
    if (slug.length < 3) return "Slug too short";
    return null;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acc-1",
    tenantId: "tenant-1",
    username: "admin",
    passwordHash: "100000:aabbcc:ddeeff",
    role: "admin",
    status: "active",
    createdAt: 1700000000,
    ...overrides,
  };
}

function makeTenantConfig(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    slug: "koperasi-maju",
    name: "Koperasi Maju",
    timezone: "Asia/Jakarta",
    mode: "local",
    createdAt: 1700000000,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockLocalAccountStorePut.mockResolvedValue(undefined);
  mockLocalTenantConfigStorePut.mockResolvedValue(undefined);
  mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);
  mockLocalTenantConfigStoreGet.mockResolvedValue(null);
  mockLocalAccountStoreGetByTenant.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── localLoginWithReason ──────────────────────────────────────────────────────

describe("localLoginWithReason", () => {
  it("returns wrong_credentials when username not found", async () => {
    const { localLoginWithReason } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(null);

    const result = await localLoginWithReason("unknown", "pass");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("wrong_credentials");
  });

  it("returns inactive when account status is not active", async () => {
    const { localLoginWithReason } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount({ status: "inactive" }));

    const result = await localLoginWithReason("admin", "pass");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("inactive");
  });

  it("returns wrong_credentials when tenant config not found", async () => {
    const { localLoginWithReason } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount());
    mockLocalTenantConfigStoreGet.mockResolvedValue(null);

    const result = await localLoginWithReason("admin", "pass");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("wrong_credentials");
  });

  it("returns wrong_tenant when tenantSlug does not match", async () => {
    const { localLoginWithReason } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount());
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeTenantConfig({ slug: "koperasi-maju" }));

    const result = await localLoginWithReason("admin", "pass", "other-koperasi");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("wrong_tenant");
  });

  it("returns wrong_credentials when password is incorrect", async () => {
    const { localLoginWithReason } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount());
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeTenantConfig());

    // The stored hash won't match "wrongpassword" since it's a fake hash
    const result = await localLoginWithReason("admin", "wrongpassword");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("wrong_credentials");
  });

  it("returns success with correct data when credentials match", async () => {
    const { localLoginWithReason } = await import("../localTenant");

    // We need a real PBKDF2 hash — use the actual crypto.subtle
    // Instead, mock pbkdf2Verify by providing a hash that matches
    // We'll use a known hash format: "iterations:saltHex:hashHex"
    // Since we can't easily produce a valid hash without running the actual function,
    // we test the success path by using a real hash produced by the function itself.
    // We'll test this indirectly via setupLocalTenant + localLoginWithReason.

    // For this unit test, we verify the structure of the success return
    // by mocking the account with a hash that will be verified
    // The simplest approach: use a real hash from the actual crypto.subtle
    const enc = new TextEncoder();
    const password = "testpassword";
    const salt = new Uint8Array(16).fill(1);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    const saltHex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const hashHex = Array.from(new Uint8Array(bits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const realHash = `100000:${saltHex}:${hashHex}`;

    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount({ passwordHash: realHash }));
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeTenantConfig());

    const result = await localLoginWithReason("admin", password);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tenantId).toBe("tenant-1");
      expect(result.tenantSlug).toBe("koperasi-maju");
      expect(result.tenantName).toBe("Koperasi Maju");
      expect(result.accountId).toBe("acc-1");
      expect(result.role).toBe("admin");
    }
  });

  it("ignores tenantSlug check when no slug is provided", async () => {
    const { localLoginWithReason } = await import("../localTenant");

    const enc = new TextEncoder();
    const password = "testpassword";
    const salt = new Uint8Array(16).fill(2);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    const saltHex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const hashHex = Array.from(new Uint8Array(bits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const realHash = `100000:${saltHex}:${hashHex}`;

    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount({ passwordHash: realHash }));
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeTenantConfig());

    // No tenantSlug provided — should not check slug
    const result = await localLoginWithReason("admin", password, undefined);
    expect(result.success).toBe(true);
  });
});

// ── localLogin ────────────────────────────────────────────────────────────────

describe("localLogin", () => {
  it("returns null when login fails", async () => {
    const { localLogin } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(null);

    const result = await localLogin("unknown", "pass");
    expect(result).toBeNull();
  });

  it("returns result object when login succeeds", async () => {
    const { localLogin } = await import("../localTenant");

    const enc = new TextEncoder();
    const password = "testpassword";
    const salt = new Uint8Array(16).fill(3);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      256,
    );
    const saltHex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const hashHex = Array.from(new Uint8Array(bits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const realHash = `100000:${saltHex}:${hashHex}`;

    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount({ passwordHash: realHash }));
    mockLocalTenantConfigStoreGet.mockResolvedValue(makeTenantConfig());

    const result = await localLogin("admin", password);
    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe("tenant-1");
  });
});

// ── isLocalSlugTaken ──────────────────────────────────────────────────────────

describe("isLocalSlugTaken", () => {
  it("returns false when no local tenants exist", async () => {
    const { isLocalSlugTaken } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    expect(await isLocalSlugTaken("my-koperasi")).toBe(false);
  });

  it("returns true when slug matches an existing local tenant", async () => {
    const { isLocalSlugTaken } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([makeTenantConfig({ slug: "my-koperasi" })]);

    expect(await isLocalSlugTaken("my-koperasi")).toBe(true);
  });

  it("returns false when slug does not match any local tenant", async () => {
    const { isLocalSlugTaken } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([makeTenantConfig({ slug: "other-slug" })]);

    expect(await isLocalSlugTaken("my-koperasi")).toBe(false);
  });
});

// ── isRemoteSlugTaken ─────────────────────────────────────────────────────────

describe("isRemoteSlugTaken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when fetch fails (offline-tolerant)", async () => {
    const { isRemoteSlugTaken } = await import("../localTenant");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    expect(await isRemoteSlugTaken("my-koperasi")).toBe(false);
  });

  it("returns false when server returns non-ok response", async () => {
    const { isRemoteSlugTaken } = await import("../localTenant");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    expect(await isRemoteSlugTaken("my-koperasi")).toBe(false);
  });

  it("returns true when server returns matching slug in results", async () => {
    const { isRemoteSlugTaken } = await import("../localTenant");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tenants: [{ slug: "my-koperasi", name: "My Koperasi" }] }),
      }),
    );

    expect(await isRemoteSlugTaken("my-koperasi")).toBe(true);
  });

  it("returns false when server returns no matching slug", async () => {
    const { isRemoteSlugTaken } = await import("../localTenant");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tenants: [{ slug: "other-koperasi", name: "Other" }] }),
      }),
    );

    expect(await isRemoteSlugTaken("my-koperasi")).toBe(false);
  });

  it("handles results array format (no tenants wrapper)", async () => {
    const { isRemoteSlugTaken } = await import("../localTenant");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ slug: "my-koperasi" }] }),
      }),
    );

    expect(await isRemoteSlugTaken("my-koperasi")).toBe(true);
  });
});

// ── isSlugTaken ───────────────────────────────────────────────────────────────

describe("isSlugTaken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns taken=true with source=local when slug is taken locally", async () => {
    const { isSlugTaken } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([makeTenantConfig({ slug: "my-koperasi" })]);

    const result = await isSlugTaken("my-koperasi");
    expect(result.taken).toBe(true);
    expect(result.source).toBe("local");
  });

  it("returns taken=true with source=remote when slug is taken remotely", async () => {
    const { isSlugTaken } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tenants: [{ slug: "my-koperasi" }] }),
      }),
    );

    const result = await isSlugTaken("my-koperasi");
    expect(result.taken).toBe(true);
    expect(result.source).toBe("remote");
  });

  it("returns taken=false when slug is not taken anywhere", async () => {
    const { isSlugTaken } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tenants: [] }),
      }),
    );

    const result = await isSlugTaken("my-koperasi");
    expect(result.taken).toBe(false);
  });
});

// ── setupLocalTenant ──────────────────────────────────────────────────────────

describe("setupLocalTenant", () => {
  it("creates tenant and admin account successfully", async () => {
    const { setupLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    const result = await setupLocalTenant({
      name: "Koperasi Baru",
      slug: "koperasi-baru",
      adminUsername: "admin",
      adminPassword: "password123",
    });

    expect(result.slug).toBe("koperasi-baru");
    expect(result.name).toBe("Koperasi Baru");
    expect(result.mode).toBe("local");
    expect(mockLocalTenantConfigStorePut).toHaveBeenCalledOnce();
    expect(mockLocalAccountStorePut).toHaveBeenCalledOnce();
  });

  it("auto-generates slug from name when slug not provided", async () => {
    const { setupLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    const result = await setupLocalTenant({
      name: "Koperasi Baru",
      adminUsername: "admin",
      adminPassword: "password123",
    });

    expect(result.slug).toBe("koperasi-baru");
  });

  it("throws when slug is already taken by another local tenant", async () => {
    const { setupLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([
      makeTenantConfig({ slug: "koperasi-baru" }),
    ]);

    await expect(
      setupLocalTenant({
        name: "Koperasi Baru",
        slug: "koperasi-baru",
        adminUsername: "admin",
        adminPassword: "password123",
      }),
    ).rejects.toThrow(/sudah digunakan/);
  });

  it("throws when slug format is invalid (too short)", async () => {
    const { setupLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    await expect(
      setupLocalTenant({
        name: "AB",
        slug: "ab", // 2 chars — mocked validateSlugFormat returns error for < 3
        adminUsername: "admin",
        adminPassword: "password123",
      }),
    ).rejects.toThrow(/Slug too short/);
  });

  it("uses default timezone Asia/Jakarta when not provided", async () => {
    const { setupLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    const result = await setupLocalTenant({
      name: "Koperasi Test",
      slug: "koperasi-test",
      adminUsername: "admin",
      adminPassword: "password123",
    });

    expect(result.timezone).toBe("Asia/Jakarta");
  });

  it("uses provided timezone when specified", async () => {
    const { setupLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    const result = await setupLocalTenant({
      name: "Koperasi Test",
      slug: "koperasi-test",
      adminUsername: "admin",
      adminPassword: "password123",
      timezone: "UTC",
    });

    expect(result.timezone).toBe("UTC");
  });
});

// ── hasLocalTenant ────────────────────────────────────────────────────────────

describe("hasLocalTenant", () => {
  it("returns false when no local tenants exist", async () => {
    const { hasLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([]);

    expect(await hasLocalTenant()).toBe(false);
  });

  it("returns true when at least one local tenant exists", async () => {
    const { hasLocalTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGetAll.mockResolvedValue([makeTenantConfig()]);

    expect(await hasLocalTenant()).toBe(true);
  });
});

// ── cacheServerCredentials ────────────────────────────────────────────────────

describe("cacheServerCredentials", () => {
  it("creates new account when username does not exist locally", async () => {
    const { cacheServerCredentials } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(null);
    mockLocalTenantConfigStoreGet.mockResolvedValue(null);

    await cacheServerCredentials({
      tenantId: "tenant-1",
      tenantSlug: "koperasi-maju",
      tenantName: "Koperasi Maju",
      accountId: "acc-1",
      role: "admin",
      username: "admin",
      password: "password123",
    });

    expect(mockLocalAccountStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-1",
        username: "admin",
        role: "admin",
        status: "active",
      }),
    );
  });

  it("updates existing account when username already exists", async () => {
    const { cacheServerCredentials } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(makeAccount({ accountId: "old-acc" }));
    mockLocalTenantConfigStoreGet.mockResolvedValue(null);

    await cacheServerCredentials({
      tenantId: "tenant-1",
      tenantSlug: "koperasi-maju",
      tenantName: "Koperasi Maju",
      accountId: "acc-1",
      role: "station",
      username: "admin",
      password: "newpassword",
    });

    expect(mockLocalAccountStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "old-acc", // preserves existing accountId
        role: "station",
        status: "active",
      }),
    );
  });

  it("creates new tenant config when it does not exist", async () => {
    const { cacheServerCredentials } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(null);
    mockLocalTenantConfigStoreGet.mockResolvedValue(null);

    await cacheServerCredentials({
      tenantId: "tenant-1",
      tenantSlug: "koperasi-maju",
      tenantName: "Koperasi Maju",
      accountId: "acc-1",
      role: "admin",
      username: "admin",
      password: "password123",
    });

    expect(mockLocalTenantConfigStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        slug: "koperasi-maju",
        name: "Koperasi Maju",
        mode: "synced",
      }),
    );
  });

  it("updates existing tenant config with new name and syncedAt", async () => {
    const { cacheServerCredentials } = await import("../localTenant");
    mockLocalAccountStoreGetByUsername.mockResolvedValue(null);
    mockLocalTenantConfigStoreGet.mockResolvedValue(
      makeTenantConfig({ name: "Old Name", slug: "old-slug" }),
    );

    await cacheServerCredentials({
      tenantId: "tenant-1",
      tenantSlug: "koperasi-maju",
      tenantName: "New Name",
      accountId: "acc-1",
      role: "admin",
      username: "admin",
      password: "password123",
    });

    expect(mockLocalTenantConfigStorePut).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Name",
        slug: "koperasi-maju",
        syncedAt: expect.any(Number),
      }),
    );
  });
});

// ── exportTenant / importTenant ───────────────────────────────────────────────

describe("exportTenant / importTenant", () => {
  it("throws when tenant config not found during export", async () => {
    const { exportTenant } = await import("../localTenant");
    mockLocalTenantConfigStoreGet.mockResolvedValue(null);

    await expect(exportTenant("nonexistent", "passphrase")).rejects.toThrow(/tidak ditemukan/);
  });

  it("exports and imports tenant data round-trip", async () => {
    const { exportTenant, importTenant } = await import("../localTenant");

    const cfg = makeTenantConfig();
    const accounts = [makeAccount()];

    mockLocalTenantConfigStoreGet.mockResolvedValue(cfg);
    mockLocalAccountStoreGetByTenant.mockResolvedValue(accounts);

    const blob = await exportTenant("tenant-1", "my-passphrase");
    expect(typeof blob).toBe("string");
    expect(blob.length).toBeGreaterThan(0);

    // Import the blob back
    const imported = await importTenant(blob, "my-passphrase");
    expect(imported.tenantId).toBe("tenant-1");
    expect(imported.slug).toBe("koperasi-maju");
    expect(mockLocalTenantConfigStorePut).toHaveBeenCalledTimes(2); // export + import
    expect(mockLocalAccountStorePut).toHaveBeenCalledTimes(1); // import
  });

  it("throws when decrypting with wrong passphrase", async () => {
    const { exportTenant, importTenant } = await import("../localTenant");

    const cfg = makeTenantConfig();
    mockLocalTenantConfigStoreGet.mockResolvedValue(cfg);
    mockLocalAccountStoreGetByTenant.mockResolvedValue([makeAccount()]);

    const blob = await exportTenant("tenant-1", "correct-passphrase");

    await expect(importTenant(blob, "wrong-passphrase")).rejects.toThrow();
  });
});

// ── downloadExportBlob ────────────────────────────────────────────────────────

describe("downloadExportBlob", () => {
  it("creates and clicks an anchor element with correct filename", async () => {
    const { downloadExportBlob } = await import("../localTenant");

    const clickSpy = vi.fn();
    const mockAnchor = { href: "", download: "", click: clickSpy };
    vi.spyOn(document, "createElement").mockReturnValueOnce(
      mockAnchor as unknown as HTMLAnchorElement,
    );

    downloadExportBlob("blob-data", "koperasi-maju");

    expect(mockAnchor.download).toContain("koperasi-maju");
    expect(clickSpy).toHaveBeenCalledOnce();
  });
});

// ── deriveExportPassphrase ────────────────────────────────────────────────────

describe("deriveExportPassphrase", () => {
  it("throws when no admin account found", async () => {
    const { deriveExportPassphrase } = await import("../localTenant");
    mockLocalAccountStoreGetByTenant.mockResolvedValue([
      makeAccount({ role: "station" }), // no admin
    ]);

    await expect(deriveExportPassphrase("tenant-1", "password")).rejects.toThrow(/Admin/);
  });

  it("returns a passphrase string combining hash and password", async () => {
    const { deriveExportPassphrase } = await import("../localTenant");
    mockLocalAccountStoreGetByTenant.mockResolvedValue([
      makeAccount({ passwordHash: "100000:aabb:ccdd" }),
    ]);

    const passphrase = await deriveExportPassphrase("tenant-1", "mypassword");
    expect(passphrase).toContain("100000:aabb:ccdd");
    expect(passphrase).toContain("mypassword");
  });
});
