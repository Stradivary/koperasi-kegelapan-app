import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { processReconciliation } from "#/application/sync/reconcile.usecase";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const reconcileRoute = new Hono<{ Bindings: Env }>();

reconcileRoute.post("/", async (c) => {
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
    const result = await processReconciliation(db, { terminalId, events });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});
