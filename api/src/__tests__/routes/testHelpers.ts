/**
 * Shared test helpers for API route tests.
 *
 * Provides reusable mock factories and app builders to eliminate
 * duplication across sync, push-entities, cards, and superadmin tests.
 */

import { vi } from "vitest";
import { Hono } from "hono";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

/**
 * Creates a fake JWT-like Bearer token with the given payload.
 * Format: base64(header).base64(payload).sig
 */
export function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

export interface MockD1Options {
  /** Rows returned by `.raw()` calls */
  rawRows?: unknown[][];
  /** Value returned by `.first()` calls */
  getResult?: unknown;
  /** Results returned by `.all()` calls */
  selectResults?: unknown[];
  /** If set, `.run()` rejects with this message */
  insertThrow?: string;
  /** Alias for insertThrow (push-entities style) */
  throwOnInsert?: string;
}

/**
 * Creates a minimal mock D1Database suitable for Hono route tests.
 * Supports configuring return values for first(), all(), raw(), and run().
 */
export function createMockD1(options: MockD1Options = {}): D1Database {
  const throwMsg = options.insertThrow ?? options.throwOnInsert;
  const mockRun = throwMsg
    ? vi.fn().mockRejectedValue(new Error(throwMsg))
    : vi.fn().mockResolvedValue({ success: true, meta: {} });

  const rawRows = options.rawRows ?? [];

  return {
    prepare: (_query?: string) => ({
      bind: (..._args: unknown[]) => ({
        raw: async () => rawRows,
        first: async () => options.getResult ?? null,
        all: async () => ({ results: options.selectResults ?? [] }),
        run: mockRun,
      }),
      raw: async () => rawRows,
      first: async () => options.getResult ?? null,
      all: async () => ({ results: options.selectResults ?? [] }),
      run: mockRun,
    }),
    exec: async () => ({ count: 0, duration: 0 }),
    batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [] })),
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

/**
 * Creates a Hono app with the given route mounted and DB/env injected.
 * The route is mounted at the provided path prefix.
 * Includes mock auth middleware that decodes Bearer tokens.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTestApp(route: Hono<any>, mountPath: string, db?: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    c.env = { DB: db ?? createMockD1(), SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  // Mock auth middleware - sets auth context from token payload
  app.use("*", async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(atob(parts[1]));
          // Only set auth if required fields are present
          if (payload.accountId && payload.tenantId) {
            c.set("auth", {
              accountId: payload.accountId,
              tenantId: payload.tenantId,
              role: payload.role ?? "terminal",
              deviceId: payload.deviceId,
              iat: payload.iat ?? Math.floor(Date.now() / 1000),
              exp: payload.exp ?? Math.floor(Date.now() / 1000) + 3600,
            });
          }
        } catch {
          // Invalid token format
        }
      }
    }
    await next();
  });
  app.route(mountPath, route);
  return app;
}
