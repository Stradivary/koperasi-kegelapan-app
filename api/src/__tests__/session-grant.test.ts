// @vitest-environment node
/**
 * Tests for api/src/routes/session-grant.ts
 * Covers: GET /session-grant endpoint with authenticated access
 *
 * The session-grant route now requires a verified JWT token (via verifyToken middleware).
 * Tests use a signed token to simulate authenticated requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the issueSessionGrant function
const mockIssueSessionGrant = vi.fn().mockReturnValue({
  sessionKey: "base64key",
  expiresAt: 2000000000,
  allowedOps: ["read", "debit"],
  signature: "base64sig",
  tenantId: "t1",
  accountId: "a1",
  deviceId: "d1",
  keyVersion: 1,
});

vi.mock("../../../src/server/sessionGrant", () => ({
  issueSessionGrant: (...args: unknown[]) => mockIssueSessionGrant(...args),
}));

import { sessionGrantRoute } from "../routes/session-grant";
import { signAccessToken } from "../lib/jwt";
import { verifyToken } from "../middleware/verifyToken";

const ENV = { DB: {}, SESSION_MASTER_KEY: "abcdefghijklmnopqrstuvwxyz123456" };

// Build a test app with verifyToken middleware (mirrors production setup)
function createApp() {
  const app = new Hono();
  app.use("/session-grant/*", verifyToken);
  app.route("/session-grant", sessionGrantRoute);
  return app;
}

function makeUrl(params: Record<string, string>): string {
  const url = new URL("http://localhost/session-grant");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/** Generate a valid signed token for testing. */
async function makeToken(payload?: {
  accountId?: string;
  tenantId?: string;
  role?: string;
  deviceId?: string;
}): Promise<string> {
  return signAccessToken(
    {
      accountId: payload?.accountId ?? "acc-123",
      tenantId: payload?.tenantId ?? "t1",
      role: payload?.role ?? "admin",
      deviceId: payload?.deviceId ?? "d1",
    },
    ENV.SESSION_MASTER_KEY,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /session-grant", () => {
  it("returns 401 when no token is provided", async () => {
    const app = createApp();
    const res = await app.request(makeUrl({ tenantId: "t1", deviceId: "d1" }), undefined, ENV);
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    const app = createApp();
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "d1" }), {
      headers: { Authorization: "Bearer not-a-valid-token" },
    });
    const res = await app.request(req, undefined, ENV);
    expect(res.status).toBe(401);
  });

  it("returns 400 when tenantId is missing", async () => {
    const app = createApp();
    const token = await makeToken();
    const req = new Request(makeUrl({ deviceId: "d1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await app.request(req, undefined, ENV);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tenantId");
  });

  it("returns 403 when requesting grant for a different tenant", async () => {
    const app = createApp();
    const token = await makeToken({ tenantId: "t1" });
    const req = new Request(makeUrl({ tenantId: "t2", deviceId: "d1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await app.request(req, undefined, ENV);
    expect(res.status).toBe(403);
  });

  it("returns grant when authenticated with matching tenantId", async () => {
    const app = createApp();
    const token = await makeToken({
      tenantId: "t1",
      accountId: "acc-1",
      role: "admin",
      deviceId: "d1",
    });
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "d1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await app.request(req, undefined, ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionKey).toBe("base64key");
  });

  it("uses accountId and role from verified token", async () => {
    const app = createApp();
    const token = await makeToken({
      tenantId: "t1",
      accountId: "acc-456",
      role: "station",
      deviceId: "dev-1",
    });
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "dev-1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await app.request(req, undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "acc-456",
      "dev-1",
      "station",
    );
  });

  it("uses deviceId from query params when provided", async () => {
    const app = createApp();
    const token = await makeToken({ tenantId: "t1", deviceId: "token-device" });
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "query-device" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await app.request(req, undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      expect.any(String),
      "query-device",
      expect.any(String),
    );
  });

  it("falls back to token deviceId when query deviceId is not provided", async () => {
    const app = createApp();
    const token = await makeToken({ tenantId: "t1", deviceId: "token-device" });
    const req = new Request(makeUrl({ tenantId: "t1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await app.request(req, undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      expect.any(String),
      "token-device",
      expect.any(String),
    );
  });

  it("passes first 32 bytes of SESSION_MASTER_KEY as masterKey", async () => {
    const app = createApp();
    const key = "abcdefghijklmnopqrstuvwxyz123456extra";
    const token = await signAccessToken(
      { accountId: "a1", tenantId: "t1", role: "admin", deviceId: "d1" },
      key,
    );
    const req = new Request(makeUrl({ tenantId: "t1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await app.request(req, undefined, { DB: {}, SESSION_MASTER_KEY: key });
    const masterKeyArg = mockIssueSessionGrant.mock.calls[0][0] as Buffer;
    expect(masterKeyArg.length).toBe(32);
  });
});
