// @vitest-environment node
/**
 * Tests for api/src/routes/reconcile.ts
 * Covers: POST / (reconciliation processing)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────

const mockDb: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => mockDb),
}));

vi.mock("#/server/reconcileCore", () => ({
  processReconciliation: vi.fn((db, payload) => ({
    accepted: payload.events.length,
    rejected: 0,
    flags: [],
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { reconcileRoute } from "../../routes/reconcile";
import { processReconciliation } from "#/server/reconcileCore";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function req(method: string, path: string, body?: unknown) {
  return reconcileRoute.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    undefined,
    env,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when body is invalid JSON", async () => {
    const res = await reconcileRoute.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      undefined,
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_payload");
  });

  it("returns 400 when terminalId is missing", async () => {
    const res = await req("POST", "/", { events: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_payload");
  });

  it("returns 400 when events is missing", async () => {
    const res = await req("POST", "/", { terminalId: "terminal-1" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_payload");
  });

  it("returns 400 when events is not an array", async () => {
    const res = await req("POST", "/", { terminalId: "terminal-1", events: "not-array" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_payload");
  });

  it("returns 400 when terminalId is null", async () => {
    const res = await req("POST", "/", { terminalId: null, events: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("malformed_payload");
  });

  it("returns 200 with empty events array", async () => {
    const res = await req("POST", "/", { terminalId: "terminal-1", events: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(0);
    expect(body.flags).toEqual([]);
  });

  it("returns 200 with valid payload", async () => {
    const res = await req("POST", "/", {
      terminalId: "terminal-1",
      events: [
        { type: "transaction", amount: 100 },
        { type: "transaction", amount: 200 },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(0);
    expect(body.flags).toEqual([]);
  });

  it("returns 500 when processReconciliation throws an error", async () => {
    vi.mocked(processReconciliation).mockRejectedValueOnce(new Error("Database error"));

    const res = await req("POST", "/", { terminalId: "terminal-1", events: [] });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Database error");
  });

  it("returns 500 with string error message when non-Error thrown", async () => {
    vi.mocked(processReconciliation).mockRejectedValueOnce("String error");

    const res = await req("POST", "/", { terminalId: "terminal-1", events: [] });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("String error");
  });

  it("accepts terminalId as number", async () => {
    const res = await req("POST", "/", { terminalId: 123, events: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
  });

  it("accepts terminalId as string", async () => {
    const res = await req("POST", "/", { terminalId: "terminal-abc", events: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
  });

  it("processes multiple events", async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ type: "event", id: i }));
    const res = await req("POST", "/", { terminalId: "terminal-1", events });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(10);
  });
});
