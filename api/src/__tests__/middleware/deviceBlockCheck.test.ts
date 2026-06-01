// @vitest-environment node
/**
 * Tests for api/src/middleware/deviceBlockCheck.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock drizzle and schema
vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(),
}));

vi.mock("#/db/schema", () => ({
  devices: { deviceId: "deviceId", blockedUntil: "blockedUntil" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
}));

vi.mock("../../lib/tokenExtract", () => ({
  extractDeviceIdFromToken: vi.fn(),
}));

import { drizzle } from "drizzle-orm/d1";
import { extractDeviceIdFromToken } from "../../lib/tokenExtract";
import { deviceBlockCheck } from "../../middleware/deviceBlockCheck";

const mockExtractDeviceId = vi.mocked(extractDeviceIdFromToken);
const mockDrizzle = vi.mocked(drizzle);

function makeApp(mockDb: unknown) {
  mockDrizzle.mockReturnValue(mockDb as ReturnType<typeof drizzle>);
  const app = new Hono<{ Bindings: { DB: D1Database; SESSION_MASTER_KEY: string } }>();
  app.use("*", deviceBlockCheck);
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(path = "/test") {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: "Bearer header.payload.sig" },
  });
}

describe("deviceBlockCheck middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through when no deviceId in token", async () => {
    mockExtractDeviceId.mockReturnValue(null);
    const mockDb = { select: vi.fn().mockReturnThis() };
    const app = makeApp(mockDb);

    const res = await app.request(
      makeRequest(),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("passes through when device not found in registry", async () => {
    mockExtractDeviceId.mockReturnValue("device-123");
    const mockGet = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: mockGet,
    };
    const app = makeApp(mockDb);

    const res = await app.request(
      makeRequest(),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key" },
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 when device is blocked", async () => {
    mockExtractDeviceId.mockReturnValue("device-123");
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const mockGet = vi.fn().mockResolvedValue({ blockedUntil: futureTime });
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: mockGet,
    };
    const app = makeApp(mockDb);

    const res = await app.request(
      makeRequest(),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key" },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("device_blocked");
    expect(body.blockedUntil).toBe(futureTime);
  });

  it("passes through when block has expired", async () => {
    mockExtractDeviceId.mockReturnValue("device-123");
    const pastTime = Math.floor(Date.now() / 1000) - 3600;
    const mockGet = vi.fn().mockResolvedValue({ blockedUntil: pastTime });
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: mockGet,
    };
    const app = makeApp(mockDb);

    const res = await app.request(
      makeRequest(),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key" },
    );
    expect(res.status).toBe(200);
  });

  it("passes through when blockedUntil is null", async () => {
    mockExtractDeviceId.mockReturnValue("device-123");
    const mockGet = vi.fn().mockResolvedValue({ blockedUntil: null });
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      get: mockGet,
    };
    const app = makeApp(mockDb);

    const res = await app.request(
      makeRequest(),
      {},
      { DB: {} as D1Database, SESSION_MASTER_KEY: "key" },
    );
    expect(res.status).toBe(200);
  });
});
