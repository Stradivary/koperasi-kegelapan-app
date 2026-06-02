// @vitest-environment node
/**
 * Additional tests for api/src/routes/auth.ts
 * Covers: successful login with valid password, tenant inactive check,
 * device fingerprint flow, superadmin login without tenant slug,
 * verifyPassword with client-side format
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("#/db/schema", () => ({
  accounts: {
    accountId: "accounts.accountId",
    tenantId: "accounts.tenantId",
    username: "accounts.username",
    role: "accounts.role",
    status: "accounts.status",
    passwordHash: "accounts.passwordHash",
  },
  tenants: {
    tenantId: "tenants.tenantId",
    slug: "tenants.slug",
    name: "tenants.name",
    status: "tenants.status",
  },
  authSessions: {
    sessionId: "authSessions.sessionId",
    accountId: "authSessions.accountId",
    tenantId: "authSessions.tenantId",
    deviceId: "authSessions.deviceId",
  },
}));

vi.mock("#/server/deviceRegistry", () => ({
  registerDevice: vi.fn((_db, opts) => ({
    deviceId: `device-${opts.fingerprintHash}`,
    tenantId: opts.tenantId,
    accountId: opts.accountId,
  })),
}));

vi.mock("#/server/authSession", () => ({
  createSession: vi.fn((_db, _opts) => ({
    sessionId: "session-123",
    refreshToken: "refresh-token-123",
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
  })),
  refreshSession: vi.fn((_db, sessionId, _refreshToken) => ({
    sessionId,
    newRefreshToken: "new-refresh-token",
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
  })),
  AuthSessionError: class AuthSessionError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../lib/jwt", () => ({
  signAccessToken: vi.fn((payload) => `jwt.${btoa(JSON.stringify(payload))}.signature`),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { authRoutes } from "../../routes/auth";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-master-key" };

function _setupSelectChain(row: unknown = null) {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.get = vi.fn().mockResolvedValue(row);
}

function req(method: string, path: string, body?: unknown) {
  return authRoutes.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    undefined,
    env,
  );
}

/**
 * Generate a valid pbkdf2 password hash for testing using the same format
 * as the server implementation: "pbkdf2$saltHex$hashHex"
 * The salt is stored as hex but used as UTF-8 bytes in derivation.
 */
async function generatePasswordHash(password: string): Promise<string> {
  const salt = "746573742d73616c74"; // hex for "test-salt"
  const encoder = new TextEncoder();
  // Salt is UTF-8 encoded (the hex string itself is the salt text)
  const saltBytes = encoder.encode(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes.buffer as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    32 * 8,
  );
  const hashHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pbkdf2$${salt}$${hashHex}`;
}

/**
 * Generate a client-side format hash: "iterations:saltHex:hashHex"
 */
async function generateClientHash(password: string): Promise<string> {
  const iterations = 50000;
  const saltHex = "aabbccdd";
  const saltBytes = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes.buffer as ArrayBuffer, iterations, hash: "SHA-256" },
    keyMaterial,
    32 * 8,
  );
  const hashHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${iterations}:${saltHex}:${hashHex}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /token - successful authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with access token on valid pbkdf2 password (server format)", async () => {
    const passwordHash = await generatePasswordHash("correctpassword");

    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      // 1st: tenant lookup by slug
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      // 2nd: account lookup
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash,
      })
      // 3rd: tenant lookup for active check
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "correctpassword",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.accountId).toBe("a-1");
    expect(body.tenantId).toBe("t-1");
    expect(body.role).toBe("admin");
    expect(body.tenantSlug).toBe("test-tenant");
    expect(body.tenantName).toBe("Test");
  });

  it("returns 200 with access token on valid client-side format password", async () => {
    const passwordHash = await generateClientHash("mypassword");

    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash,
      })
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "mypassword",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.accountId).toBe("a-1");
  });

  it("returns 401 when tenant is inactive for non-superadmin", async () => {
    const passwordHash = await generatePasswordHash("password123");

    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin", // NOT superadmin
        status: "active",
        passwordHash,
      })
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "suspended", // Tenant is NOT active
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "password123",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Tenant inactive");
  });

  it("allows superadmin login even when tenant is inactive", async () => {
    const passwordHash = await generatePasswordHash("superpass");

    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      // superadmin login without tenantSlug: account lookup by username + role=superadmin
      .mockResolvedValueOnce({
        accountId: "sa-1",
        tenantId: "t-system",
        username: "superadmin",
        role: "superadmin",
        status: "active",
        passwordHash,
      })
      // Tenant lookup: tenant is suspended
      .mockResolvedValueOnce({
        tenantId: "t-system",
        slug: "system",
        name: "System",
        status: "suspended",
      });

    const res = await req("POST", "/token", {
      username: "superadmin",
      password: "superpass",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("superadmin");
    expect(body.accessToken).toBeDefined();
  });

  it("returns 200 with device and session info when fingerprint provided", async () => {
    const passwordHash = await generatePasswordHash("password123");

    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash,
      })
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "password123",
      tenantSlug: "test-tenant",
      deviceFingerprint: {
        hash: "abc123",
        userAgent: "TestAgent",
        platform: "test",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deviceId).toBe("device-abc123");
    expect(body.sessionId).toBe("session-123");
    expect(body.refreshToken).toBe("refresh-token-123");
    expect(body.expiresAt).toBeDefined();
  });

  it("returns 401 when password doesn't match stored hash (pbkdf2 format)", async () => {
    const passwordHash = await generatePasswordHash("correctpassword");

    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash,
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "wrongpassword",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid credentials");
  });

  it("returns 401 for malformed pbkdf2 hash (not 3 parts)", async () => {
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash: "pbkdf2$onlytwoParts",
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "password123",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for client-side format with invalid iterations", async () => {
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash: "notanumber:aabb:ccdd",
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "password123",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown hash format (neither pbkdf2$ nor colon-separated)", async () => {
    mockDb.select = vi.fn().mockReturnValue(mockDb);
    mockDb.from = vi.fn().mockReturnValue(mockDb);
    mockDb.where = vi.fn().mockReturnValue(mockDb);
    mockDb.get = vi
      .fn()
      .mockResolvedValueOnce({
        tenantId: "t-1",
        slug: "test-tenant",
        name: "Test",
        status: "active",
      })
      .mockResolvedValueOnce({
        accountId: "a-1",
        tenantId: "t-1",
        username: "admin",
        role: "admin",
        status: "active",
        passwordHash: "completely-wrong-format",
      });

    const res = await req("POST", "/token", {
      username: "admin",
      password: "password123",
      tenantSlug: "test-tenant",
    });
    expect(res.status).toBe(401);
  });
});
