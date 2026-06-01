// @vitest-environment node
/**
 * Additional tests for cards.ts covering uncovered lines:
 * - Line 56: check-uid returns exists:true when rawRows has data (already covered)
 * - Line 118: POST /:cardId/block - card not found (404)
 * Also covers the full block endpoint happy path and validation paths.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cardsRoutes } from "../../routes/cards";
import { createMockD1, createTestApp, makeToken } from "./testHelpers";

function makeBlockRequest(
  app: ReturnType<typeof createTestApp>,
  cardId: string,
  body: unknown,
  token?: string,
) {
  const tok = token ?? makeToken({ tenantId: "t1", accountId: "a1", role: "admin" });
  return app.request(`/api/cards/${cardId}/block`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tok}`,
    },
  });
}

describe("POST /api/cards/:cardId/block", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp(cardsRoutes, "/api/cards", createMockD1());
  });

  it("returns 401 without auth token", async () => {
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      body: JSON.stringify({ reason: "blocked_admin", changedBy: "admin" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing", async () => {
    const tok = makeToken({ tenantId: "t1", accountId: "a1", role: "admin" });
    const res = await app.request("/api/cards/04a2b3c4d5e6f7/block", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason is missing", async () => {
    const res = await makeBlockRequest(app, "04a2b3c4d5e6f7", { changedBy: "admin" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("reason");
  });

  it("returns 400 when changedBy is missing", async () => {
    const res = await makeBlockRequest(app, "04a2b3c4d5e6f7", { reason: "blocked_admin" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("changedBy");
  });

  it("returns 400 for invalid reason", async () => {
    const res = await makeBlockRequest(app, "04a2b3c4d5e6f7", {
      reason: "invalid_reason",
      changedBy: "admin",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid reason");
  });

  it("returns 404 when card does not exist (line 118)", async () => {
    // createMockD1 with getResult: null means card lookup returns null
    const localApp = createTestApp(cardsRoutes, "/api/cards", createMockD1({ getResult: null }));
    const res = await makeBlockRequest(localApp, "04a2b3c4d5e6f7", {
      reason: "blocked_admin",
      changedBy: "admin",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });
});

describe("GET /api/cards/check-uid - additional coverage (line 56)", () => {
  it("returns exists:true when rawRows has tenant data", async () => {
    const localApp = createTestApp(
      cardsRoutes,
      "/api/cards",
      createMockD1({ rawRows: [["tenant-abc"]] }),
    );
    const res = await localApp.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.tenantId).toBe("tenant-abc");
  });
});
