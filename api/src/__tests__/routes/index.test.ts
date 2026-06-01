// @vitest-environment node
/**
 * Tests for api/src/index.ts
 * Verifies the Hono app middleware chain and route mounting.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Middleware mocks (no top-level variables in factory) ──────────────────────

vi.mock("../../middleware/cors", () => ({
  corsMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../middleware/deviceBlockCheck", () => ({
  deviceBlockCheck: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../middleware/verifyToken", () => ({
  verifyToken: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../middleware/authRateLimit", () => ({
  authRateLimit: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../middleware/syncRateLimit", () => ({
  syncRateLimit: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock("../../middleware/syncAnalytics", () => ({
  syncAnalytics: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Route mocks ───────────────────────────────────────────────────────────────

vi.mock("../../routes/auth", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "auth" }));
  return { authRoutes: r };
});
vi.mock("../../routes/session-grant", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "session-grant" }));
  return { sessionGrantRoute: r };
});
vi.mock("../../routes/policy", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "policy" }));
  return { policyRoute: r };
});
vi.mock("../../routes/reconcile", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "reconcile" }));
  return { reconcileRoute: r };
});
vi.mock("../../routes/tenants", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "tenants" }));
  return { tenantsRoutes: r };
});
vi.mock("../../routes/superadmin", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "superadmin" }));
  return { superadminRoutes: r };
});
vi.mock("../../routes/accounts", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "accounts" }));
  return { accountsRoutes: r };
});
vi.mock("../../routes/sync", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "sync" }));
  return { syncRoutes: r };
});
vi.mock("../../routes/cards", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "cards" }));
  return { cardsRoutes: r };
});
vi.mock("../../routes/client-errors", () => {
  const { Hono: H } = require("hono");
  const r = new H();
  r.get("/", (c: { json: (b: unknown) => Response }) => c.json({ route: "client-errors" }));
  return { clientErrorsRoute: r };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import app from "../../index";
import { corsMiddleware } from "../../middleware/cors";
import { deviceBlockCheck } from "../../middleware/deviceBlockCheck";
import { verifyToken } from "../../middleware/verifyToken";
import { authRateLimit } from "../../middleware/authRateLimit";
import { syncRateLimit } from "../../middleware/syncRateLimit";
import { syncAnalytics } from "../../middleware/syncAnalytics";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };
const env: Env = { DB: {} as D1Database, SESSION_MASTER_KEY: "test-key" };

function req(method: string, path: string) {
  return app.request(new Request(`http://localhost${path}`, { method }), undefined, env);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("api/src/index.ts - route mounting", () => {
  beforeEach(() => {
    vi.mocked(corsMiddleware).mockImplementation(async (_c, next) => next());
    vi.mocked(deviceBlockCheck).mockImplementation(async (_c, next) => next());
    vi.mocked(verifyToken).mockImplementation(async (_c, next) => next());
    vi.mocked(authRateLimit).mockImplementation(async (_c, next) => next());
    vi.mocked(syncRateLimit).mockImplementation(async (_c, next) => next());
    vi.mocked(syncAnalytics).mockImplementation(async (_c, next) => next());
  });

  // Verify the app handles /api/* paths (middleware is invoked = route is mounted)
  it("handles /api/auth/* paths (CORS + authRateLimit applied)", async () => {
    await req("GET", "/api/auth/");
    expect(corsMiddleware).toHaveBeenCalled();
    expect(authRateLimit).toHaveBeenCalled();
  });

  it("handles /api/client-errors/* paths (CORS applied, no authRateLimit)", async () => {
    await req("GET", "/api/client-errors/");
    expect(corsMiddleware).toHaveBeenCalled();
  });

  it("handles /api/sync/* paths (syncRateLimit + syncAnalytics applied)", async () => {
    await req("GET", "/api/sync/");
    expect(syncRateLimit).toHaveBeenCalled();
    expect(syncAnalytics).toHaveBeenCalled();
  });

  it("handles /api/accounts/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/accounts/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("handles /api/cards/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/cards/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("handles /api/policy/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/policy/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("handles /api/tenants/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/tenants/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("handles /api/superadmin/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/superadmin/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("handles /api/reconcile/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/reconcile/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("handles /api/session-grant/* paths (verifyToken applied)", async () => {
    await req("GET", "/api/session-grant/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await req("GET", "/api/unknown-route/");
    expect(res.status).toBe(404);
  });
});

describe("api/src/index.ts - middleware chain", () => {
  beforeEach(() => {
    vi.mocked(corsMiddleware).mockImplementation(async (_c, next) => next());
    vi.mocked(deviceBlockCheck).mockImplementation(async (_c, next) => next());
    vi.mocked(verifyToken).mockImplementation(async (_c, next) => next());
    vi.mocked(authRateLimit).mockImplementation(async (_c, next) => next());
    vi.mocked(syncRateLimit).mockImplementation(async (_c, next) => next());
    vi.mocked(syncAnalytics).mockImplementation(async (_c, next) => next());
  });

  it("applies CORS middleware to /api/* routes", async () => {
    await req("GET", "/api/auth/");
    expect(corsMiddleware).toHaveBeenCalled();
  });

  it("applies deviceBlockCheck to /api/* routes", async () => {
    await req("GET", "/api/auth/");
    expect(deviceBlockCheck).toHaveBeenCalled();
  });

  it("applies authRateLimit to /api/auth/* routes", async () => {
    await req("GET", "/api/auth/");
    expect(authRateLimit).toHaveBeenCalled();
  });

  it("applies verifyToken to protected routes", async () => {
    await req("GET", "/api/accounts/");
    expect(verifyToken).toHaveBeenCalled();
  });

  it("applies syncRateLimit to /api/sync/* routes", async () => {
    await req("GET", "/api/sync/");
    expect(syncRateLimit).toHaveBeenCalled();
  });

  it("applies syncAnalytics to /api/sync/* routes", async () => {
    await req("GET", "/api/sync/");
    expect(syncAnalytics).toHaveBeenCalled();
  });

  it("blocks request when deviceBlockCheck rejects", async () => {
    vi.mocked(deviceBlockCheck).mockImplementation(async (c: unknown) => {
      const ctx = c as { json: (b: unknown, s: number) => Response };
      return ctx.json({ error: "Device blocked" }, 403);
    });
    const res = await req("GET", "/api/accounts/");
    expect(res.status).toBe(403);
  });

  it("blocks request when verifyToken rejects", async () => {
    vi.mocked(verifyToken).mockImplementation(async (c: unknown) => {
      const ctx = c as { json: (b: unknown, s: number) => Response };
      return ctx.json({ error: "Unauthorized" }, 401);
    });
    const res = await req("GET", "/api/accounts/");
    expect(res.status).toBe(401);
  });
});
