// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDbGet = vi.fn();

vi.mock("#/infrastructure/persistence/drizzle", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => mockDbGet(),
        }),
      }),
    }),
  }),
}));

vi.mock("#/infrastructure/persistence/drizzle/schema", () => ({
  accounts: { accountId: "accountId", username: "username", role: "role", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isAuthError", () => {
  it("returns true for a Response object", async () => {
    const { isAuthError } = await import("../superadminAuth");
    const response = new Response("test", { status: 401 });
    expect(isAuthError(response)).toBe(true);
  });

  it("returns false for a SuperadminAccount object", async () => {
    const { isAuthError } = await import("../superadminAuth");
    const account = { accountId: "a-1", username: "admin", role: "superadmin" };
    expect(isAuthError(account)).toBe(false);
  });
});

describe("requireSuperadmin", () => {
  function makeRequest(authHeader?: string): Request {
    const headers: Record<string, string> = {};
    if (authHeader) headers["authorization"] = authHeader;
    return new Request("https://example.com/api/test", { headers });
  }

  function makeToken(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: "none" }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.sig`;
  }

  it("returns 401 when no Authorization header", async () => {
    const { requireSuperadmin } = await import("../superadminAuth");
    const result = await requireSuperadmin(makeRequest());
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when Authorization header is not Bearer", async () => {
    const { requireSuperadmin } = await import("../superadminAuth");
    const result = await requireSuperadmin(makeRequest("Basic abc123"));
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when token has no accountId", async () => {
    const { requireSuperadmin } = await import("../superadminAuth");
    const token = makeToken({ role: "superadmin" }); // no accountId
    const result = await requireSuperadmin(makeRequest(`Bearer ${token}`));
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when account not found in DB", async () => {
    mockDbGet.mockResolvedValue(null);
    const { requireSuperadmin } = await import("../superadminAuth");
    const token = makeToken({ accountId: "a-1" });
    const result = await requireSuperadmin(makeRequest(`Bearer ${token}`));
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 when account role is not superadmin", async () => {
    mockDbGet.mockResolvedValue({ accountId: "a-1", username: "admin", role: "admin" });
    const { requireSuperadmin } = await import("../superadminAuth");
    const token = makeToken({ accountId: "a-1" });
    const result = await requireSuperadmin(makeRequest(`Bearer ${token}`));
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(403);
  });

  it("returns account info when superadmin role is confirmed", async () => {
    mockDbGet.mockResolvedValue({
      accountId: "a-1",
      username: "superadmin",
      role: "superadmin",
    });
    const { requireSuperadmin } = await import("../superadminAuth");
    const token = makeToken({ accountId: "a-1" });
    const result = await requireSuperadmin(makeRequest(`Bearer ${token}`));
    expect(result instanceof Response).toBe(false);
    expect((result as { accountId: string }).accountId).toBe("a-1");
    expect((result as { role: string }).role).toBe("superadmin");
  });

  it("returns 401 when token is malformed", async () => {
    const { requireSuperadmin } = await import("../superadminAuth");
    const result = await requireSuperadmin(makeRequest("Bearer not.a.valid.token"));
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });
});
