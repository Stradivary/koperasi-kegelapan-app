// @vitest-environment node
/**
 * Tests for api/src/routes/policy.ts
 * Covers: GET with tenantId, GET without tenantId, default policy shape
 */
import { describe, expect, it } from "vitest";
import { policyRoute } from "../../routes/policy";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function getPolicy(tenantId?: string) {
  const url = tenantId ? `http://localhost/?tenantId=${tenantId}` : "http://localhost/";
  return policyRoute.request(new Request(url, { method: "GET" }), undefined, env);
}

describe("GET /api/policy", () => {
  it("returns 400 when tenantId is missing", async () => {
    const res = await getPolicy();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenantId required");
  });

  it("returns 200 with policy for a given tenantId", async () => {
    const res = await getPolicy("t-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe("t-1");
  });

  it("returns default maxTransactionAmount of 1_000_000", async () => {
    const res = await getPolicy("t-1");
    const body = await res.json();
    expect(body.maxTransactionAmount).toBe(1_000_000);
  });

  it("returns default maxDailyTotal of 5_000_000", async () => {
    const res = await getPolicy("t-1");
    const body = await res.json();
    expect(body.maxDailyTotal).toBe(5_000_000);
  });

  it("returns topupOnlineOnly as true by default", async () => {
    const res = await getPolicy("t-1");
    const body = await res.json();
    expect(body.topupOnlineOnly).toBe(true);
  });

  it("returns allowedTxTypes array", async () => {
    const res = await getPolicy("t-1");
    const body = await res.json();
    expect(body.allowedTxTypes).toEqual(["debit", "credit", "checkin", "checkout"]);
  });

  it("returns sessionTimeoutHours of 24", async () => {
    const res = await getPolicy("t-1");
    const body = await res.json();
    expect(body.sessionTimeoutHours).toBe(24);
  });

  it("returns different tenantId in response for different inputs", async () => {
    const res1 = await getPolicy("tenant-a");
    const res2 = await getPolicy("tenant-b");
    const b1 = await res1.json();
    const b2 = await res2.json();
    expect(b1.tenantId).toBe("tenant-a");
    expect(b2.tenantId).toBe("tenant-b");
  });
});
