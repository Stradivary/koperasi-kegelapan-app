// @vitest-environment node
/**
 * Tests for api/src/routes/superadmin.ts
 * Covers: GET /tenants, POST /tenants, GET /tenants/:tenantId, PATCH /tenants/:tenantId/status,
 *         GET /devices, POST /devices/:deviceId/block, POST /devices/:deviceId/unblock,
 *         GET /accounts, POST /accounts, PATCH /accounts/:accountId/status, POST /accounts/:accountId/change-password
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("#/server/superadminAuth", () => ({
  requireSuperadmin: vi.fn((_req) => ({ accountId: "superadmin-1", tenantId: "t-system" })),
  isAuthError: vi.fn((result) => result?.error !== undefined),
}));

vi.mock("#/server/superadminTenants", () => ({
  listTenants: vi.fn(() => ({ tenants: [], total: 0 })),
  createTenant: vi.fn(() => ({ data: { tenantId: "t-new" }, status: 201 })),
  getTenantDetail: vi.fn(() => ({ data: { tenantId: "t-1", name: "Test" }, status: 200 })),
  updateTenantStatus: vi.fn(() => ({ data: { tenantId: "t-1", status: "active" }, status: 200 })),
}));

vi.mock("#/server/superadminAccounts", () => ({
  listAccounts: vi.fn(() => ({ accounts: [], total: 0 })),
  createAccount: vi.fn(() => ({ data: { accountId: "a-new" }, status: 201 })),
  changeAccountPassword: vi.fn(() => ({ data: { success: true }, status: 200 })),
  updateAccountStatus: vi.fn(() => ({ data: { accountId: "a-1", status: "active" }, status: 200 })),
}));

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("#/db", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("#/db/schema", () => ({
  devices: {
    deviceId: "devices.deviceId",
    tenantId: "devices.tenantId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}));

vi.mock("#/server/deviceRegistry", () => ({
  getDevicesByTenant: vi.fn(() => []),
  blockDevice: vi.fn(),
  unblockDevice: vi.fn(),
  revokeDeviceSessions: vi.fn(() => 2),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { superadminRoutes } from "../../routes/superadmin";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function req(method: string, path: string, body?: unknown) {
  return superadminRoutes.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    undefined,
    env,
  );
}

function setupSelectChain(row: unknown = null) {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.get = vi.fn().mockResolvedValue(row);
  mockDb.transaction = vi.fn(async (callback) => {
    await callback(mockDb);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with tenant list", async () => {
    const res = await req("GET", "/tenants");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants).toBeDefined();
  });

  it("accepts page and pageSize query params", async () => {
    const res = await req("GET", "/tenants?page=2&pageSize=50");
    expect(res.status).toBe(200);
  });

  it("accepts search query param", async () => {
    const res = await req("GET", "/tenants?search=test");
    expect(res.status).toBe(200);
  });
});

describe("POST /tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 on successful creation", async () => {
    const res = await req("POST", "/tenants", { name: "New Tenant", slug: "new-tenant" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tenantId).toBe("t-new");
  });
});

describe("GET /tenants/:tenantId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when tenantId is missing", async () => {
    const res = await req("GET", "/tenants/");
    expect(res.status).toBe(404);
  });

  it("returns 200 with tenant detail", async () => {
    const res = await req("GET", "/tenants/t-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe("t-1");
  });
});

describe("PATCH /tenants/:tenantId/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when status is missing", async () => {
    const res = await req("PATCH", "/tenants/t-1/status", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("status");
  });

  it("returns 400 when status is invalid", async () => {
    const res = await req("PATCH", "/tenants/t-1/status", { status: "invalid" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid status");
  });

  it("accepts active status", async () => {
    const res = await req("PATCH", "/tenants/t-1/status", { status: "active" });
    expect(res.status).toBe(200);
  });

  it("accepts suspended status", async () => {
    const res = await req("PATCH", "/tenants/t-1/status", { status: "suspended" });
    expect(res.status).toBe(200);
  });

  it("accepts archived status", async () => {
    const res = await req("PATCH", "/tenants/t-1/status", { status: "archived" });
    expect(res.status).toBe(200);
  });
});

describe("GET /devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when tenantId is missing", async () => {
    const res = await req("GET", "/devices");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tenantId");
  });

  it("returns 200 with device list", async () => {
    const res = await req("GET", "/devices?tenantId=t-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.devices).toBeDefined();
  });
});

describe("POST /devices/:deviceId/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain({ deviceId: "device-1" });
  });

  it("returns 400 when durationSeconds is missing", async () => {
    const res = await req("POST", "/devices/device-1/block", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("durationSeconds");
  });

  it("returns 400 when durationSeconds is not a number", async () => {
    const res = await req("POST", "/devices/device-1/block", { durationSeconds: "invalid" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when durationSeconds is too small (< 60)", async () => {
    const res = await req("POST", "/devices/device-1/block", { durationSeconds: 30 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid duration");
  });

  it("returns 400 when durationSeconds is too large (> 31536000)", async () => {
    const res = await req("POST", "/devices/device-1/block", { durationSeconds: 40000000 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid duration");
  });

  it("returns 404 when device not found", async () => {
    setupSelectChain(null);
    const res = await req("POST", "/devices/nonexistent/block", { durationSeconds: 3600 });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Device not found");
  });

  it("returns 200 on successful block", async () => {
    const res = await req("POST", "/devices/device-1/block", { durationSeconds: 3600 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
    expect(body.deviceId).toBe("device-1");
    expect(body.blockedUntil).toBeDefined();
    expect(body.sessionsRevoked).toBe(2);
  });

  it("accepts minimum duration (60 seconds)", async () => {
    const res = await req("POST", "/devices/device-1/block", { durationSeconds: 60 });
    expect(res.status).toBe(200);
  });

  it("accepts maximum duration (31536000 seconds)", async () => {
    const res = await req("POST", "/devices/device-1/block", { durationSeconds: 31536000 });
    expect(res.status).toBe(200);
  });
});

describe("POST /devices/:deviceId/unblock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain({ deviceId: "device-1" });
  });

  it("returns 404 when device not found", async () => {
    setupSelectChain(null);
    const res = await req("POST", "/devices/nonexistent/unblock", {});
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Device not found");
  });

  it("returns 200 on successful unblock", async () => {
    const res = await req("POST", "/devices/device-1/unblock", {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(false);
    expect(body.deviceId).toBe("device-1");
    expect(body.blockedUntil).toBeNull();
  });
});

describe("GET /accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with account list", async () => {
    const res = await req("GET", "/accounts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toBeDefined();
  });

  it("accepts page and pageSize query params", async () => {
    const res = await req("GET", "/accounts?page=1&pageSize=25");
    expect(res.status).toBe(200);
  });

  it("accepts search query param", async () => {
    const res = await req("GET", "/accounts?search=admin");
    expect(res.status).toBe(200);
  });
});

describe("POST /accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 on successful creation", async () => {
    const res = await req("POST", "/accounts", {
      username: "newadmin",
      password: "password123",
      role: "admin",
      tenantId: "t-1",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.accountId).toBe("a-new");
  });
});

describe("PATCH /accounts/:accountId/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when status is missing", async () => {
    const res = await req("PATCH", "/accounts/a-1/status", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("status");
  });

  it("returns 200 on successful status update", async () => {
    const res = await req("PATCH", "/accounts/a-1/status", { status: "suspended" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountId).toBe("a-1");
  });
});

describe("POST /accounts/:accountId/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when newPassword is missing", async () => {
    const res = await req("POST", "/accounts/a-1/change-password", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("newPassword");
  });

  it("returns 200 on successful password change", async () => {
    const res = await req("POST", "/accounts/a-1/change-password", { newPassword: "newpass123" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
