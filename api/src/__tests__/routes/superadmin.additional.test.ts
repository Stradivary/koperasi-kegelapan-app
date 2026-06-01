// @vitest-environment node
/**
 * Additional tests for superadmin.ts covering uncovered lines:
 * - Error paths (500 responses) for all routes
 * - Device not found (404) paths
 * - GET /tenants with search/pagination params
 * - GET /accounts with search/pagination params
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { superadminRoutes } from "../../routes/superadmin";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

// Mock superadmin auth
vi.mock("#/server/superadminAuth", () => ({
  requireSuperadmin: vi.fn().mockResolvedValue({ accountId: "sa1", role: "superadmin" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

// Mock tenant functions - default success, can be overridden per test
const mockListTenants = vi.fn().mockResolvedValue({ tenants: [], total: 0, page: 1, pageSize: 20 });
const mockCreateTenant = vi.fn().mockResolvedValue({ status: 201, data: { tenantId: "t1" } });
const mockGetTenantDetail = vi.fn().mockResolvedValue({ status: 200, data: { tenantId: "t1" } });
const mockUpdateTenantStatus = vi.fn().mockResolvedValue({ status: 200, data: { ok: true } });

vi.mock("#/server/superadminTenants", () => ({
  listTenants: (...args: unknown[]) => mockListTenants(...args),
  createTenant: (...args: unknown[]) => mockCreateTenant(...args),
  getTenantDetail: (...args: unknown[]) => mockGetTenantDetail(...args),
  updateTenantStatus: (...args: unknown[]) => mockUpdateTenantStatus(...args),
}));

// Mock account functions
const mockListAccounts = vi.fn().mockResolvedValue({ accounts: [], total: 0 });
const mockCreateAccount = vi.fn().mockResolvedValue({ status: 201, data: { accountId: "a1" } });
const mockChangeAccountPassword = vi.fn().mockResolvedValue({ status: 200, data: { ok: true } });
const mockUpdateAccountStatus = vi.fn().mockResolvedValue({ status: 200, data: { ok: true } });

vi.mock("#/server/superadminAccounts", () => ({
  listAccounts: (...args: unknown[]) => mockListAccounts(...args),
  createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  changeAccountPassword: (...args: unknown[]) => mockChangeAccountPassword(...args),
  updateAccountStatus: (...args: unknown[]) => mockUpdateAccountStatus(...args),
}));

// Mock DB - device not found by default
const mockDeviceGet = vi.fn().mockResolvedValue(null);
vi.mock("#/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: mockDeviceGet,
        })),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      });
    }),
  })),
}));

const mockGetDevicesByTenant = vi.fn().mockResolvedValue([]);
const mockBlockDevice = vi.fn().mockResolvedValue(undefined);
const mockUnblockDevice = vi.fn().mockResolvedValue(undefined);
const mockRevokeDeviceSessions = vi.fn().mockResolvedValue(0);

vi.mock("#/server/deviceRegistry", () => ({
  getDevicesByTenant: (...args: unknown[]) => mockGetDevicesByTenant(...args),
  blockDevice: (...args: unknown[]) => mockBlockDevice(...args),
  unblockDevice: (...args: unknown[]) => mockUnblockDevice(...args),
  revokeDeviceSessions: (...args: unknown[]) => mockRevokeDeviceSessions(...args),
}));

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    c.env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.route("/api/superadmin", superadminRoutes);
  return app;
}

describe("superadmin routes - error paths and additional coverage", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
    // Reset to success defaults
    mockListTenants.mockResolvedValue({ tenants: [], total: 0, page: 1, pageSize: 20 });
    mockCreateTenant.mockResolvedValue({ status: 201, data: { tenantId: "t1" } });
    mockGetTenantDetail.mockResolvedValue({ status: 200, data: { tenantId: "t1" } });
    mockUpdateTenantStatus.mockResolvedValue({ status: 200, data: { ok: true } });
    mockListAccounts.mockResolvedValue({ accounts: [], total: 0 });
    mockCreateAccount.mockResolvedValue({ status: 201, data: { accountId: "a1" } });
    mockChangeAccountPassword.mockResolvedValue({ status: 200, data: { ok: true } });
    mockUpdateAccountStatus.mockResolvedValue({ status: 200, data: { ok: true } });
    mockDeviceGet.mockResolvedValue({ deviceId: "dev1" });
    mockGetDevicesByTenant.mockResolvedValue([]);
    mockRevokeDeviceSessions.mockResolvedValue(0);
  });

  describe("GET /tenants - error path", () => {
    it("returns 500 when listTenants throws", async () => {
      mockListTenants.mockRejectedValueOnce(new Error("DB error"));
      const res = await app.request("/api/superadmin/tenants");
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("DB error");
    });

    it("passes search and pagination params", async () => {
      const res = await app.request("/api/superadmin/tenants?page=2&pageSize=5&search=test");
      expect(res.status).toBe(200);
      expect(mockListTenants).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 5, search: "test" }),
      );
    });
  });

  describe("POST /tenants - error path", () => {
    it("returns 500 when createTenant throws", async () => {
      mockCreateTenant.mockRejectedValueOnce(new Error("Insert failed"));
      const res = await app.request("/api/superadmin/tenants", {
        method: "POST",
        body: JSON.stringify({ slug: "test" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("GET /tenants/:tenantId - error path", () => {
    it("returns 500 when getTenantDetail throws", async () => {
      mockGetTenantDetail.mockRejectedValueOnce(new Error("Not found"));
      const res = await app.request("/api/superadmin/tenants/t1");
      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /tenants/:tenantId/status - error path", () => {
    it("returns 500 when updateTenantStatus throws", async () => {
      mockUpdateTenantStatus.mockRejectedValueOnce(new Error("Update failed"));
      const res = await app.request("/api/superadmin/tenants/t1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("GET /devices - error path", () => {
    it("returns 500 when getDevicesByTenant throws", async () => {
      mockGetDevicesByTenant.mockRejectedValueOnce(new Error("DB error"));
      const res = await app.request("/api/superadmin/devices?tenantId=t1");
      expect(res.status).toBe(500);
    });
  });

  describe("POST /devices/:deviceId/block - device not found", () => {
    it("returns 404 when device does not exist", async () => {
      mockDeviceGet.mockResolvedValueOnce(null);
      const res = await app.request("/api/superadmin/devices/nonexistent/block", {
        method: "POST",
        body: JSON.stringify({ durationSeconds: 3600 }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns 500 when block operation throws", async () => {
      mockDeviceGet.mockResolvedValueOnce({ deviceId: "dev1" });
      mockBlockDevice.mockRejectedValueOnce(new Error("Block failed"));
      const res = await app.request("/api/superadmin/devices/dev1/block", {
        method: "POST",
        body: JSON.stringify({ durationSeconds: 3600 }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("POST /devices/:deviceId/unblock - device not found", () => {
    it("returns 404 when device does not exist", async () => {
      mockDeviceGet.mockResolvedValueOnce(null);
      const res = await app.request("/api/superadmin/devices/nonexistent/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(404);
    });

    it("returns 500 when unblock operation throws", async () => {
      mockDeviceGet.mockResolvedValueOnce({ deviceId: "dev1" });
      mockUnblockDevice.mockRejectedValueOnce(new Error("Unblock failed"));
      const res = await app.request("/api/superadmin/devices/dev1/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("GET /accounts - error path", () => {
    it("returns 500 when listAccounts throws", async () => {
      mockListAccounts.mockRejectedValueOnce(new Error("DB error"));
      const res = await app.request("/api/superadmin/accounts");
      expect(res.status).toBe(500);
    });

    it("passes search and pagination params", async () => {
      const res = await app.request("/api/superadmin/accounts?page=3&pageSize=10&search=admin");
      expect(res.status).toBe(200);
      expect(mockListAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, pageSize: 10, search: "admin" }),
      );
    });
  });

  describe("POST /accounts - error path", () => {
    it("returns 500 when createAccount throws", async () => {
      mockCreateAccount.mockRejectedValueOnce(new Error("Insert failed"));
      const res = await app.request("/api/superadmin/accounts", {
        method: "POST",
        body: JSON.stringify({ username: "test" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("PATCH /accounts/:accountId/status - error path", () => {
    it("returns 500 when updateAccountStatus throws", async () => {
      mockUpdateAccountStatus.mockRejectedValueOnce(new Error("Update failed"));
      const res = await app.request("/api/superadmin/accounts/a1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });

  describe("POST /accounts/:accountId/change-password - error path", () => {
    it("returns 500 when changeAccountPassword throws", async () => {
      mockChangeAccountPassword.mockRejectedValueOnce(new Error("Hash failed"));
      const res = await app.request("/api/superadmin/accounts/a1/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: "newpass123" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(500);
    });
  });
});
