import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { accounts } from "#/infrastructure/persistence/drizzle/schema";
import { hashPassword, generateId } from "#/domain/auth/authRules";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

export const accountsRoutes = new Hono<{ Bindings: Env }>();

accountsRoutes.get("/", async (c) => {
  const tenantId = c.req.query("tenantId");
  if (!tenantId) {
    return c.json({ error: "tenantId required" }, 400);
  }

  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      accountId: accounts.accountId,
      username: accounts.username,
      role: accounts.role,
      status: accounts.status,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId))
    .all();

  return c.json(rows);
});

accountsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.tenantId || !body?.username?.trim() || !body?.password || !body?.role) {
    return c.json({ error: "tenantId, username, password, and role required" }, 400);
  }

  const validRoles = ["admin", "station", "gate", "terminal", "scout"];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: "invalid role" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "password must be at least 8 characters" }, 400);
  }

  const db = drizzle(c.env.DB);
  const accountId = generateId();
  const passwordHash = hashPassword(body.password);

  try {
    await db
      .insert(accounts)
      .values({
        accountId,
        tenantId: body.tenantId,
        username: body.username.trim(),
        passwordHash,
        role: body.role,
        status: "active",
      })
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return c.json({ error: "Username already exists" }, 409);
    }
    throw e;
  }

  return c.json({ ok: true, accountId });
});

accountsRoutes.patch("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.tenantId || !body?.accountId || !body?.status) {
    return c.json({ error: "tenantId, accountId, and status required" }, 400);
  }
  if (!["active", "suspended"].includes(body.status)) {
    return c.json({ error: "invalid status" }, 400);
  }

  const db = drizzle(c.env.DB);
  await db
    .update(accounts)
    .set({ status: body.status })
    .where(and(eq(accounts.tenantId, body.tenantId), eq(accounts.accountId, body.accountId)))
    .run();

  return c.json({ ok: true });
});
