// @vitest-environment node
/**
 * Tests for api/src/middleware/syncRateLimit.ts
 * Covers: 60 req/min sliding window, 429 with Retry-After, no device_id passthrough
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { syncRateLimit } from "../../middleware/syncRateLimit";

// Mock tokenExtract so we can control the device_id
const mockExtractDeviceId = vi.fn<() => string | null>();

vi.mock("../../lib/tokenExtract", () => ({
  extractDeviceIdFromToken: () => mockExtractDeviceId(),
}));

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    // @ts-expect-error - mock env
    c.env = { DB: {}, SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.use("/api/sync/*", syncRateLimit);
  app.post("/api/sync/push", (c) => c.json({ ok: true }));
  return app;
}

function pushRequest(app: ReturnType<typeof createApp>) {
  return app.request("/api/sync/push", { method: "POST" });
}

describe("syncRateLimit middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExtractDeviceId.mockReturnValue("device-abc");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("passes through when no device_id is present", async () => {
    mockExtractDeviceId.mockReturnValue(null);
    const app = createApp();
    const res = await pushRequest(app);
    expect(res.status).toBe(200);
  });

  it("allows requests under the 60 req/min limit", async () => {
    const app = createApp();
    for (let i = 0; i < 59; i++) {
      const res = await pushRequest(app);
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 after 60 requests in the window", async () => {
    const app = createApp();
    for (let i = 0; i < 60; i++) {
      await pushRequest(app);
    }
    const res = await pushRequest(app);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("includes Retry-After header on 429", async () => {
    const app = createApp();
    for (let i = 0; i < 60; i++) {
      await pushRequest(app);
    }
    const res = await pushRequest(app);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate limits are per device_id", async () => {
    const app = createApp();
    // Fill up device-abc
    for (let i = 0; i < 60; i++) {
      await pushRequest(app);
    }
    // Switch to a different device
    mockExtractDeviceId.mockReturnValue("device-xyz");
    const res = await pushRequest(app);
    expect(res.status).toBe(200);
  });

  it("allows requests again after the 60-second window expires", async () => {
    const app = createApp();
    for (let i = 0; i < 60; i++) {
      await pushRequest(app);
    }
    // Advance past the window
    vi.advanceTimersByTime(61_000);
    const res = await pushRequest(app);
    expect(res.status).toBe(200);
  });

  it("retryAfter is clamped between 1 and 60 seconds", async () => {
    const app = createApp();
    for (let i = 0; i < 60; i++) {
      await pushRequest(app);
    }
    const res = await pushRequest(app);
    const body = await res.json();
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
  });
});
