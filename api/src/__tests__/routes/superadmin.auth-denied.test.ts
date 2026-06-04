// @vitest-environment node
/**
 * Tests for api/src/routes/superadmin.ts - auth denied paths
 * Covers: All routes returning auth error when superadmin check fails
 * This fills the ~26% branch gap where isAuthError returns true.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { superadminRoutes } from "../../routes/superadmin";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

// Mock auth to DENY access (returns a Response with error)
vi.mock("#/application/admin/superadminAuth.usecase", () => ({
  requireSuperadmin: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  ),
  isAuthError: vi.fn().mockReturnValue(true),
}));

vi.mock("#/application/admin/superadminTenants.usecase", () => ({
  listTenants: vi.fn(),
  createTenant: vi.fn(),
  getTenantDetail: vi.fn(),
  updateTenantStatus: vi.fn(),
}));

vi.mock("#/application/admin/superadminAccounts.usecase", () => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  changeAccountPassword: vi.fn(),
  updateAccountStatus: vi.fn(),
}));

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("#/infrastructure/persistence/drizzle/schema", () => ({
  devices: { deviceId: "devices.deviceId", tenantId: "devices.tenantId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("#/application/device/deviceRegistry.usecase", () => ({
  getDevicesByTenant: vi.fn(),
  blockDevice: vi.fn(),
  unblockDevice: vi.fn(),
  revokeDeviceSessions: vi.fn(),
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

describe("superadmin routes - auth denied for all endpoints", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  it("GET /tenants returns auth error", async () => {
    const res = await app.request("/api/superadmin/tenants");
    expect(res.status).toBe(403);
  });

  it("POST /tenants returns auth error", async () => {
    const res = await app.request("/api/superadmin/tenants", {
      method: "POST",
      body: JSON.stringify({ slug: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /tenants/:tenantId returns auth error", async () => {
    const res = await app.request("/api/superadmin/tenants/t-1");
    expect(res.status).toBe(403);
  });

  it("PATCH /tenants/:tenantId/status returns auth error", async () => {
    const res = await app.request("/api/superadmin/tenants/t-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /devices returns auth error", async () => {
    const res = await app.request("/api/superadmin/devices?tenantId=t-1");
    expect(res.status).toBe(403);
  });

  it("POST /devices/:deviceId/block returns auth error", async () => {
    const res = await app.request("/api/superadmin/devices/d-1/block", {
      method: "POST",
      body: JSON.stringify({ durationSeconds: 3600 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("POST /devices/:deviceId/unblock returns auth error", async () => {
    const res = await app.request("/api/superadmin/devices/d-1/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("GET /accounts returns auth error", async () => {
    const res = await app.request("/api/superadmin/accounts");
    expect(res.status).toBe(403);
  });

  it("POST /accounts returns auth error", async () => {
    const res = await app.request("/api/superadmin/accounts", {
      method: "POST",
      body: JSON.stringify({ username: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /accounts/:accountId/status returns auth error", async () => {
    const res = await app.request("/api/superadmin/accounts/a-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("POST /accounts/:accountId/change-password returns auth error", async () => {
    const res = await app.request("/api/superadmin/accounts/a-1/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword: "newpass123" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });
});
