import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { superadminRoutes } from "../superadmin";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

// Mock superadmin auth
vi.mock("#/server/superadminAuth", () => ({
  requireSuperadmin: vi.fn().mockResolvedValue({ accountId: "sa1", role: "superadmin" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

// Mock tenant functions
vi.mock("#/server/superadminTenants", () => ({
  listTenants: vi.fn().mockResolvedValue({ tenants: [], total: 0, page: 1, pageSize: 20 }),
  createTenant: vi
    .fn()
    .mockResolvedValue({
      status: 201,
      data: { tenantId: "t1", slug: "test", name: "Test", adminAccountId: "a1" },
    }),
  getTenantDetail: vi
    .fn()
    .mockResolvedValue({ status: 200, data: { tenantId: "t1", slug: "test", name: "Test" } }),
  updateTenantStatus: vi
    .fn()
    .mockResolvedValue({
      status: 200,
      data: { tenantId: "t1", status: "suspended", updatedAt: "2025-01-01" },
    }),
}));

// Mock account functions
vi.mock("#/server/superadminAccounts", () => ({
  listAccounts: vi.fn().mockResolvedValue({ accounts: [], total: 0, page: 1, pageSize: 20 }),
  createAccount: vi
    .fn()
    .mockResolvedValue({ status: 201, data: { accountId: "a1", username: "user" } }),
  changeAccountPassword: vi.fn().mockResolvedValue({ status: 200, data: { ok: true } }),
  updateAccountStatus: vi
    .fn()
    .mockResolvedValue({ status: 200, data: { ok: true, accountId: "a1", status: "active" } }),
}));

// Mock DB and device registry
vi.mock("#/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ deviceId: "dev1" }),
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

vi.mock("#/server/deviceRegistry", () => ({
  getDevicesByTenant: vi.fn().mockResolvedValue([{ deviceId: "d1", tenantId: "t1" }]),
  blockDevice: vi.fn().mockResolvedValue(undefined),
  unblockDevice: vi.fn().mockResolvedValue(undefined),
  revokeDeviceSessions: vi.fn().mockResolvedValue(2),
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

describe("superadmin routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe("GET /tenants", () => {
    it("returns tenant list", async () => {
      const res = await app.request("/api/superadmin/tenants");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenants).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe("POST /tenants", () => {
    it("creates a tenant", async () => {
      const res = await app.request("/api/superadmin/tenants", {
        method: "POST",
        body: JSON.stringify({
          slug: "test",
          name: "Test",
          timezone: "Asia/Jakarta",
          adminUsername: "admin",
          adminPassword: "password123",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tenantId).toBe("t1");
    });
  });

  describe("GET /tenants/:tenantId", () => {
    it("returns tenant detail", async () => {
      const res = await app.request("/api/superadmin/tenants/t1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tenantId).toBe("t1");
    });
  });

  describe("PATCH /tenants/:tenantId/status", () => {
    it("returns 400 without status field", async () => {
      const res = await app.request("/api/superadmin/tenants/t1/status", {
        method: "PATCH",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid status value", async () => {
      const res = await app.request("/api/superadmin/tenants/t1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "invalid" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid status");
    });

    it("updates status with valid value", async () => {
      const res = await app.request("/api/superadmin/tenants/t1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "suspended" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
    });

    it("accepts all valid statuses", async () => {
      for (const status of ["active", "suspended", "archived"]) {
        const res = await app.request("/api/superadmin/tenants/t1/status", {
          method: "PATCH",
          body: JSON.stringify({ status }),
          headers: { "Content-Type": "application/json" },
        });
        expect(res.status).toBe(200);
      }
    });
  });

  describe("GET /devices", () => {
    it("returns 400 without tenantId query param", async () => {
      const res = await app.request("/api/superadmin/devices");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("tenantId");
    });

    it("returns device list with tenantId", async () => {
      const res = await app.request("/api/superadmin/devices?tenantId=t1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.devices).toBeDefined();
    });
  });

  describe("POST /devices/:deviceId/block", () => {
    it("returns 400 without durationSeconds", async () => {
      const res = await app.request("/api/superadmin/devices/dev1/block", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-integer durationSeconds", async () => {
      const res = await app.request("/api/superadmin/devices/dev1/block", {
        method: "POST",
        body: JSON.stringify({ durationSeconds: 3.5 }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for duration below minimum (60)", async () => {
      const res = await app.request("/api/superadmin/devices/dev1/block", {
        method: "POST",
        body: JSON.stringify({ durationSeconds: 30 }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for duration above maximum", async () => {
      const res = await app.request("/api/superadmin/devices/dev1/block", {
        method: "POST",
        body: JSON.stringify({ durationSeconds: 31_536_001 }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("blocks device with valid duration", async () => {
      const res = await app.request("/api/superadmin/devices/dev1/block", {
        method: "POST",
        body: JSON.stringify({ durationSeconds: 3600 }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.blocked).toBe(true);
      expect(body.deviceId).toBe("dev1");
      expect(body.blockedUntil).toBeGreaterThan(0);
      expect(body.sessionsRevoked).toBe(2);
    });
  });

  describe("POST /devices/:deviceId/unblock", () => {
    it("unblocks device", async () => {
      const res = await app.request("/api/superadmin/devices/dev1/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.blocked).toBe(false);
      expect(body.deviceId).toBe("dev1");
    });
  });

  describe("GET /accounts", () => {
    it("returns account list", async () => {
      const res = await app.request("/api/superadmin/accounts");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accounts).toEqual([]);
    });
  });

  describe("POST /accounts", () => {
    it("creates an account", async () => {
      const res = await app.request("/api/superadmin/accounts", {
        method: "POST",
        body: JSON.stringify({
          tenantId: "t1",
          username: "user",
          password: "password123",
          role: "admin",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /accounts/:accountId/status", () => {
    it("returns 400 without status field", async () => {
      const res = await app.request("/api/superadmin/accounts/a1/status", {
        method: "PATCH",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("updates account status", async () => {
      const res = await app.request("/api/superadmin/accounts/a1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /accounts/:accountId/change-password", () => {
    it("returns 400 without newPassword", async () => {
      const res = await app.request("/api/superadmin/accounts/a1/change-password", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("changes password", async () => {
      const res = await app.request("/api/superadmin/accounts/a1/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: "newpass123" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
    });
  });
});
