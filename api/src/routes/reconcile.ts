import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { processReconciliation } from "../../../src/server/reconcileCore";
import { logger } from "../lib/logger";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const reconcileRoute = new Hono<{ Bindings: Env }>();

reconcileRoute.post("/", async (c) => {
  const auth = c.get("auth");
  if (!auth) {
    logger.warn("reconcile/401: auth context missing after middleware", {
      path: c.req.path,
      method: c.req.method,
    });
    return c.json({ error: "Authentication required", reason: "auth_context_missing" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: "malformed_payload" }, 400);
  }

  const { terminalId, events } = body;
  if (terminalId == null || !Array.isArray(events)) {
    return c.json({ error: "malformed_payload" }, 400);
  }

  try {
    const db = drizzle(c.env.DB);
    logger.info("reconcile: processing", {
      tenantId: auth.tenantId,
      terminalId,
      eventsCount: events.length,
    });
    const result = await processReconciliation(db, { terminalId, events });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("reconcile: processing failed", {
      tenantId: auth.tenantId,
      terminalId,
      error: msg,
    });
    return c.json({ error: msg }, 500);
  }
});
