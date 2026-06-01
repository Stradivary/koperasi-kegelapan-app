// @vitest-environment node
import { describe, it, expect } from "vitest";
import { extractDeviceIdFromToken, extractTokenPayload } from "../../lib/tokenExtract";

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers["authorization"] = authHeader;
  }
  return new Request("http://localhost/test", { headers });
}

function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe("extractTokenPayload", () => {
  it("returns null when no Authorization header is present", () => {
    const req = makeRequest();
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when Authorization header is not Bearer", () => {
    const req = makeRequest("Basic abc123");
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when Bearer token is empty", () => {
    const req = makeRequest("Bearer ");
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when token has fewer than 2 parts", () => {
    const req = makeRequest("Bearer single-part-token");
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when token payload is not valid base64", () => {
    const req = makeRequest("Bearer header.!!!invalid-base64!!!.sig");
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when token payload is not valid JSON", () => {
    const header = btoa("not-json");
    const body = btoa("also-not-json");
    const req = makeRequest(`Bearer ${header}.${body}.sig`);
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when tenantId is missing from payload", () => {
    const token = makeToken({ accountId: "acc-1" });
    const req = makeRequest(`Bearer ${token}`);
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("returns null when accountId is missing from payload", () => {
    const token = makeToken({ tenantId: "t-1" });
    const req = makeRequest(`Bearer ${token}`);
    expect(extractTokenPayload(req)).toBeNull();
  });

  it("extracts tenantId and accountId from valid token", () => {
    const token = makeToken({ tenantId: "t-1", accountId: "acc-1" });
    const req = makeRequest(`Bearer ${token}`);
    const result = extractTokenPayload(req);
    expect(result).toEqual({
      tenantId: "t-1",
      accountId: "acc-1",
      deviceId: undefined,
    });
  });

  it("extracts deviceId when present in token", () => {
    const token = makeToken({ tenantId: "t-1", accountId: "acc-1", deviceId: "dev-1" });
    const req = makeRequest(`Bearer ${token}`);
    const result = extractTokenPayload(req);
    expect(result).toEqual({
      tenantId: "t-1",
      accountId: "acc-1",
      deviceId: "dev-1",
    });
  });
});

describe("extractDeviceIdFromToken", () => {
  it("returns null when no Authorization header is present", () => {
    const req = makeRequest();
    expect(extractDeviceIdFromToken(req)).toBeNull();
  });

  it("returns null when token is malformed", () => {
    const req = makeRequest("Bearer bad-token");
    expect(extractDeviceIdFromToken(req)).toBeNull();
  });

  it("returns null when deviceId is not in payload", () => {
    const token = makeToken({ tenantId: "t-1", accountId: "acc-1" });
    const req = makeRequest(`Bearer ${token}`);
    expect(extractDeviceIdFromToken(req)).toBeNull();
  });

  it("returns deviceId when present in payload", () => {
    const token = makeToken({ tenantId: "t-1", accountId: "acc-1", deviceId: "device-abc" });
    const req = makeRequest(`Bearer ${token}`);
    expect(extractDeviceIdFromToken(req)).toBe("device-abc");
  });
});
