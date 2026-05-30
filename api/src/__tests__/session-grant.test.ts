/**
 * Tests for api/src/routes/session-grant.ts
 * Covers: GET /session-grant endpoint, token decoding, parameter handling
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

const app = new Hono();
app.route("/session-grant", sessionGrantRoute);

const ENV = { DB: {}, SESSION_MASTER_KEY: "abcdefghijklmnopqrstuvwxyz123456" };

function makeUrl(params: Record<string, string>): string {
  const url = new URL("http://localhost/session-grant");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /session-grant", () => {
  it("returns 400 when tenantId is missing", async () => {
    const res = await app.request(makeUrl({ deviceId: "d1" }), undefined, ENV);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tenantId");
  });

  it("returns grant when tenantId is provided", async () => {
    const res = await app.request(makeUrl({ tenantId: "t1", deviceId: "d1" }), undefined, ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionKey).toBe("base64key");
  });

  it("uses deviceId from query params", async () => {
    await app.request(makeUrl({ tenantId: "t1", deviceId: "my-device" }), undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      expect.any(String),
      "my-device",
      expect.any(String),
    );
  });

  it("defaults deviceId to 'unknown' when not provided", async () => {
    await app.request(makeUrl({ tenantId: "t1" }), undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      expect.any(String),
      "unknown",
      expect.any(String),
    );
  });

  it("decodes accountId from Bearer token", async () => {
    const payload = btoa(JSON.stringify({ accountId: "acc-123", role: "admin" }));
    const token = `header.${payload}.sig`;
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "d1" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await app.request(req, undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "acc-123",
      "d1",
      "admin",
    );
  });

  it("uses 'anonymous' accountId when no token", async () => {
    await app.request(makeUrl({ tenantId: "t1", deviceId: "d1" }), undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "anonymous",
      "d1",
      "terminal",
    );
  });

  it("uses role from query param over token role", async () => {
    const payload = btoa(JSON.stringify({ accountId: "acc-1", role: "admin" }));
    const token = `header.${payload}.sig`;
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "d1", role: "gate" }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    await app.request(req, undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "acc-1",
      "d1",
      "gate",
    );
  });

  it("handles malformed token gracefully", async () => {
    const req = new Request(makeUrl({ tenantId: "t1", deviceId: "d1" }), {
      headers: { Authorization: "Bearer not-a-valid-token" },
    });
    await app.request(req, undefined, ENV);
    expect(mockIssueSessionGrant).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      "anonymous",
      "d1",
      "terminal",
    );
  });

  it("passes first 32 bytes of SESSION_MASTER_KEY as masterKey", async () => {
    const key = "abcdefghijklmnopqrstuvwxyz123456extra";
    await app.request(makeUrl({ tenantId: "t1" }), undefined, { DB: {}, SESSION_MASTER_KEY: key });
    const masterKeyArg = mockIssueSessionGrant.mock.calls[0][0] as Buffer;
    expect(masterKeyArg.length).toBe(32);
  });
});
