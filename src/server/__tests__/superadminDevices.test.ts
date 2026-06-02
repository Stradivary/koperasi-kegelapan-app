/**
 * Unit tests for superadmin device management API routes.
 *
 * Tests validation logic, auth enforcement, and error handling for:
 * - GET /api/superadmin/devices?tenantId=X
 * - POST /api/superadmin/devices/:deviceId/block
 * - POST /api/superadmin/devices/:deviceId/unblock
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock device data
const mockDevices = [
  {
    deviceId: "device-1",
    tenantId: "tenant-1",
    accountId: "account-1",
    fingerprintHash: "a".repeat(64),
    userAgent: "Mozilla/5.0",
    platform: "Win32",
    lastSeenAt: 1700000000,
    blockedUntil: null,
    createdAt: 1699000000,
  },
  {
    deviceId: "device-2",
    tenantId: "tenant-1",
    accountId: "account-2",
    fingerprintHash: "b".repeat(64),
    userAgent: "Chrome/120",
    platform: "Linux",
    lastSeenAt: 1700001000,
    blockedUntil: null,
    createdAt: 1699001000,
  },
];

// Track mock calls
const mockBlockDevice = vi.fn<(...args: any[]) => any>();
const mockRevokeDeviceSessions = vi.fn<(...args: any[]) => any>(() => 2);
const mockUnblockDevice = vi.fn<(...args: any[]) => any>();
const mockGetDevicesByTenant = vi.fn<(...args: any[]) => any>(() => mockDevices);

// Mock modules
vi.mock("#/application/admin/superadminAuth.usecase", () => ({
  requireSuperadmin: vi.fn(async (request: Request) => {
    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    if (token === "non-superadmin-token") {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Superadmin role required." }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    if (token === "superadmin-token") {
      return { accountId: "sa-account-1", username: "superadmin", role: "superadmin" };
    }
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }),
  isAuthError: (result: unknown) => result instanceof Response,
}));

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn((/* deviceId check */) => ({ deviceId: "device-1" })),
          all: vi.fn(() => mockDevices),
        })),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({});
    }),
  })),
}));

vi.mock("#/infrastructure/persistence/drizzle/schema", () => ({
  devices: {
    deviceId: "device_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock("#/application/device/deviceRegistry.usecase", () => ({
  getDevicesByTenant: (...args: any[]) => mockGetDevicesByTenant(...args),
  blockDevice: (...args: any[]) => mockBlockDevice(...args),
  unblockDevice: (...args: any[]) => mockUnblockDevice(...args),
  revokeDeviceSessions: (...args: any[]) => mockRevokeDeviceSessions(...args),
}));

// Import after mocks
import { superadminRoutes } from "../../../api/src/routes/superadmin";

// Create a test app
const app = new Hono();
app.route("/api/superadmin", superadminRoutes);

function createRequest(method: string, path: string, options?: { body?: unknown; token?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
}

describe("GET /api/superadmin/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDevicesByTenant.mockReturnValue(mockDevices);
  });

  it("returns 401 when no auth token is provided", async () => {
    const req = createRequest("GET", "/api/superadmin/devices?tenantId=tenant-1");
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not superadmin", async () => {
    const req = createRequest("GET", "/api/superadmin/devices?tenantId=tenant-1", {
      token: "non-superadmin-token",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when tenantId query param is missing", async () => {
    const req = createRequest("GET", "/api/superadmin/devices", {
      token: "superadmin-token",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tenantId");
  });

  it("returns device list for valid superadmin request", async () => {
    const req = createRequest("GET", "/api/superadmin/devices?tenantId=tenant-1", {
      token: "superadmin-token",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.devices).toBeDefined();
    expect(mockGetDevicesByTenant).toHaveBeenCalled();
  });
});

describe("POST /api/superadmin/devices/:deviceId/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBlockDevice.mockResolvedValue(undefined);
    mockRevokeDeviceSessions.mockResolvedValue(2);
  });

  it("returns 401 when no auth token is provided", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      body: { durationSeconds: 3600 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not superadmin", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "non-superadmin-token",
      body: { durationSeconds: 3600 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is missing durationSeconds", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: {},
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("durationSeconds");
  });

  it("returns 400 when durationSeconds is not a number", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: "3600" },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when duration is below minimum (60 seconds)", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: 59 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid duration");
  });

  it("returns 400 when duration is above maximum (31,536,000 seconds)", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: 31_536_001 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid duration");
  });

  it("returns 400 when duration is not an integer", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: 3600.5 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });

  it("accepts minimum valid duration (60 seconds)", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: 60 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
  });

  it("accepts maximum valid duration (31,536,000 seconds)", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: 31_536_000 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
  });

  it("returns blockedUntil and sessionsRevoked on success", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/block", {
      token: "superadmin-token",
      body: { durationSeconds: 86400 },
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
    expect(body.deviceId).toBe("device-1");
    expect(body.blockedUntil).toBeGreaterThan(0);
    expect(body.sessionsRevoked).toBeDefined();
  });
});

describe("POST /api/superadmin/devices/:deviceId/unblock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnblockDevice.mockResolvedValue(undefined);
  });

  it("returns 401 when no auth token is provided", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/unblock");
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not superadmin", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/unblock", {
      token: "non-superadmin-token",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it("returns success with blocked=false on valid unblock", async () => {
    const req = createRequest("POST", "/api/superadmin/devices/device-1/unblock", {
      token: "superadmin-token",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(false);
    expect(body.deviceId).toBe("device-1");
    expect(body.blockedUntil).toBeNull();
  });
});
