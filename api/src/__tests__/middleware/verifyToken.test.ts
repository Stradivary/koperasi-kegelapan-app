// @vitest-environment node
/**
 * Tests for api/src/middleware/verifyToken.ts
 * Covers: public route skipping, session-grant scout skip, auth header validation, token verification
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the jwt module
vi.mock("../../lib/jwt", () => ({
  verifyAccessToken: vi.fn(),
  verifyAccessTokenVerbose: vi.fn(),
}));

import { verifyToken } from "../../middleware/verifyToken";
import { verifyAccessToken, verifyAccessTokenVerbose } from "../../lib/jwt";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    c.env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.use("/api/*", verifyToken);
  // Protected route
  app.get("/api/protected", (c) => c.json({ ok: true, auth: c.get("auth") }));
  // Public routes (mounted before middleware in real app, but verifyToken skips them)
  app.get("/api/tenants/search", (c) => c.json({ tenants: [] }));
  app.get("/api/client-errors", (c) => c.json({ ok: true }));
  app.get("/api/session-grant", (c) => c.json({ ok: true }));
  return app;
}

describe("verifyToken middleware", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  it("skips verification for /api/tenants paths", async () => {
    const res = await app.request("http://localhost/api/tenants/search?q=test", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("skips verification for /api/client-errors paths", async () => {
    const res = await app.request("http://localhost/api/client-errors", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("skips verification for /api/session-grant?role=scout", async () => {
    const res = await app.request("http://localhost/api/session-grant?role=scout", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("does NOT skip verification for /api/session-grant without role=scout", async () => {
    const res = await app.request("http://localhost/api/session-grant?role=admin", {
      method: "GET",
    });
    // No auth header, so should get 401
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("does NOT skip verification for /api/session-grant without any role param", async () => {
    const res = await app.request("http://localhost/api/session-grant", {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.request("http://localhost/api/protected", {
      method: "GET",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 401 when Authorization header doesn't start with Bearer", async () => {
    const res = await app.request("http://localhost/api/protected", {
      method: "GET",
      headers: { Authorization: "Basic abc123" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 401 when Bearer token is empty", async () => {
    const res = await app.request("http://localhost/api/protected", {
      method: "GET",
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 401 when token verification fails (invalid/expired)", async () => {
    vi.mocked(verifyAccessTokenVerbose).mockResolvedValue({
      ok: false,
      reason: "invalid_signature",
    });
    const res = await app.request("http://localhost/api/protected", {
      method: "GET",
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid or expired token");
  });

  it("sets auth context and calls next() on successful verification", async () => {
    const mockPayload = {
      accountId: "a-1",
      tenantId: "t-1",
      role: "admin",
      iat: 1000,
      exp: 9999999999,
    };
    vi.mocked(verifyAccessTokenVerbose).mockResolvedValue({ ok: true, payload: mockPayload });
    const res = await app.request("http://localhost/api/protected", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.auth).toEqual(mockPayload);
    expect(verifyAccessTokenVerbose).toHaveBeenCalledWith("valid-token", "test-key");
  });
});
