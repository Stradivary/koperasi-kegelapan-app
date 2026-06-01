// @vitest-environment node
/**
 * Tests for api/src/routes/client-errors.ts
 * Covers: POST validation, analytics write, token extraction, passthrough on missing analytics
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientErrorsRoute } from "../../routes/client-errors";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
  CLIENT_ERRORS_ANALYTICS?: { writeDataPoint: ReturnType<typeof vi.fn> };
  SYNC_ANALYTICS?: { writeDataPoint: ReturnType<typeof vi.fn> };
};

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key", ...overrides };
}

function postError(body: unknown, env: Env = makeEnv(), headers: Record<string, string> = {}) {
  return clientErrorsRoute.request(
    new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    undefined,
    env,
  );
}

describe("POST /api/client-errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await clientErrorsRoute.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      }),
      undefined,
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 200 with ok:true for valid payload", async () => {
    const res = await postError({
      category: "nfc_write_failure",
      message: "Write failed",
      deviceId: "d-1",
      timestamp: 1700000000,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 with empty body (uses defaults)", async () => {
    const res = await postError({});
    expect(res.status).toBe(200);
  });

  it("writes to CLIENT_ERRORS_ANALYTICS when available", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    await postError({ category: "test_error", message: "msg", deviceId: "d-1" }, env);
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.indexes).toEqual(["test_error"]);
    expect(call.blobs[0]).toBe("test_error");
    expect(call.blobs[1]).toBe("msg");
    expect(call.blobs[2]).toBe("d-1");
  });

  it("falls back to SYNC_ANALYTICS when CLIENT_ERRORS_ANALYTICS is absent", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ SYNC_ANALYTICS: { writeDataPoint } });
    await postError({ category: "fallback_test" }, env);
    expect(writeDataPoint).toHaveBeenCalledOnce();
  });

  it("does not throw when no analytics binding is present", async () => {
    const res = await postError({ category: "no_analytics" }, makeEnv());
    expect(res.status).toBe(200);
  });

  it("truncates message to 200 chars", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    const longMsg = "x".repeat(300);
    await postError({ category: "cat", message: longMsg }, env);
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[1].length).toBe(200);
  });

  it("truncates category to 100 chars", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    const longCat = "c".repeat(150);
    await postError({ category: longCat }, env);
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0].length).toBe(100);
  });

  it("extracts tenantId from Bearer token", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    // Build a fake JWT with tenantId in payload
    const payload = btoa(JSON.stringify({ tenantId: "t-extracted" }));
    const fakeToken = `header.${payload}.sig`;
    await postError({ category: "cat" }, env, { Authorization: `Bearer ${fakeToken}` });
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[3]).toBe("t-extracted");
  });

  it("uses unknown tenantId when token is malformed", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    await postError({ category: "cat" }, env, { Authorization: "Bearer bad.token" });
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[3]).toBe("unknown");
  });

  it("uses unknown tenantId when no Authorization header", async () => {
    const writeDataPoint = vi.fn();
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    await postError({ category: "cat" }, env);
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[3]).toBe("unknown");
  });

  it("does not throw when analytics.writeDataPoint throws", async () => {
    const writeDataPoint = vi.fn().mockImplementation(() => {
      throw new Error("analytics down");
    });
    const env = makeEnv({ CLIENT_ERRORS_ANALYTICS: { writeDataPoint } });
    const res = await postError({ category: "cat" }, env);
    expect(res.status).toBe(200);
  });
});
