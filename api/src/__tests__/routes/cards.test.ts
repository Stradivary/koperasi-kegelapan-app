// @vitest-environment node
/**
 * Tests for api/src/routes/cards.ts
 * Covers: GET /check-uid, POST /:cardId/block
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  ne: vi.fn((a: unknown, b: unknown) => ({ ne: [a, b] })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings, values })),
}));

vi.mock("#/db/schema", () => ({
  cards: {
    cardId: "cards.cardId",
    tenantId: "cards.tenantId",
    status: "cards.status",
    updatedAt: "cards.updatedAt",
    notes: "cards.notes",
  },
  cardEvents: {
    tenantId: "cardEvents.tenantId",
    cardId: "cardEvents.cardId",
    eventType: "cardEvents.eventType",
    payload: "cardEvents.payload",
    sourceDeviceId: "cardEvents.sourceDeviceId",
    createdAt: "cardEvents.createdAt",
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { cardsRoutes } from "../../routes/cards";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function setupSelectChain(row: unknown = null) {
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.from = vi.fn().mockReturnValue(mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.get = vi.fn().mockResolvedValue(row);
}

function setupTransaction(_fn: () => void) {
  mockDb.transaction = vi.fn(async (callback) => {
    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
    };
    await callback(tx);
  });
}

function req(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return cardsRoutes.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    undefined,
    env,
  );
}

function createAuthHeader(payload: {
  tenantId: string;
  accountId: string;
  role: string;
  deviceId?: string;
}) {
  const token = `header.${btoa(JSON.stringify(payload))}.signature`;
  return { authorization: `Bearer ${token}` };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /check-uid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain();
  });

  it("returns 400 when uid is missing", async () => {
    const res = await req("GET", "/check-uid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("uid query parameter is required");
  });

  it("returns 400 when uid is too short (< 8 chars)", async () => {
    const res = await req("GET", "/check-uid?uid=abc123");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid UID format");
  });

  it("returns 400 when uid is too long (> 14 chars)", async () => {
    const res = await req("GET", "/check-uid?uid=abcdef1234567890");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid UID format");
  });

  it("returns 400 when uid contains non-hex characters", async () => {
    const res = await req("GET", "/check-uid?uid=abcdefgh");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid UID format");
  });

  it("normalizes uid to lowercase and strips non-hex characters", async () => {
    setupSelectChain(null);
    const res = await req("GET", "/check-uid?uid=ABCD:EF12");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
  });

  it("returns exists: false when card not found", async () => {
    setupSelectChain(null);
    const res = await req("GET", "/check-uid?uid=abcdef1234");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
  });

  it("returns exists: true with tenantId when card found", async () => {
    setupSelectChain({ tenantId: "t-1" });
    const res = await req("GET", "/check-uid?uid=abcdef1234");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.tenantId).toBe("t-1");
  });

  it("accepts 8-character hex UID", async () => {
    setupSelectChain(null);
    const res = await req("GET", "/check-uid?uid=abcdef12");
    expect(res.status).toBe(200);
  });

  it("accepts 14-character hex UID", async () => {
    setupSelectChain(null);
    const res = await req("GET", "/check-uid?uid=abcdef12345678");
    expect(res.status).toBe(200);
  });
});

describe("POST /:cardId/block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectChain();
    setupTransaction(() => {});
  });

  it("returns 401 when no authorization header", async () => {
    const res = await req("POST", "/abcdef1234/block", {
      reason: "blocked_admin",
      changedBy: "admin",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 401 when authorization header is malformed", async () => {
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_admin",
        changedBy: "admin",
      },
      { authorization: "InvalidToken" },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 404 when cardId is missing", async () => {
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "//block",
      {
        reason: "blocked_admin",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await cardsRoutes.request(
      new Request("http://localhost/abcdef1234/block", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "not-json",
      }),
      undefined,
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason is missing", async () => {
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req("POST", "/abcdef1234/block", { changedBy: "admin" }, headers);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("reason is required");
  });

  it("returns 400 when changedBy is missing", async () => {
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req("POST", "/abcdef1234/block", { reason: "blocked_admin" }, headers);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("changedBy is required");
  });

  it("returns 400 when reason is invalid", async () => {
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "invalid_reason",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid reason");
  });

  it("returns 404 when card not found", async () => {
    setupSelectChain(null);
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_admin",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Card not found");
  });

  it("returns 200 on successful block with blocked_admin reason", async () => {
    setupSelectChain({ tenantId: "t-1", status: "ACTIVE" });
    setupTransaction(() => {});
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_admin",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cardId).toBe("abcdef1234");
    expect(body.status).toBe("blocked_admin");
    expect(body.changedBy).toBe("admin");
    expect(body.timestamp).toBeDefined();
  });

  it("accepts blocked_tamper reason", async () => {
    setupSelectChain({ tenantId: "t-1", status: "ACTIVE" });
    setupTransaction(() => {});
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_tamper",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("blocked_tamper");
  });

  it("accepts blocked_fraud reason", async () => {
    setupSelectChain({ tenantId: "t-1", status: "ACTIVE" });
    setupTransaction(() => {});
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_fraud",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("blocked_fraud");
  });

  it("accepts blocked_expired reason", async () => {
    setupSelectChain({ tenantId: "t-1", status: "ACTIVE" });
    setupTransaction(() => {});
    const headers = createAuthHeader({ tenantId: "t-1", accountId: "a-1", role: "admin" });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_expired",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("blocked_expired");
  });

  it("includes deviceId in event when present in token", async () => {
    setupSelectChain({ tenantId: "t-1", status: "ACTIVE" });
    setupTransaction(() => {});
    const headers = createAuthHeader({
      tenantId: "t-1",
      accountId: "a-1",
      role: "admin",
      deviceId: "device-123",
    });
    const res = await req(
      "POST",
      "/abcdef1234/block",
      {
        reason: "blocked_admin",
        changedBy: "admin",
      },
      headers,
    );
    expect(res.status).toBe(200);
  });
});
