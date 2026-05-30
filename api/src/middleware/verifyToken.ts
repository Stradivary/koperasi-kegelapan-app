/**
 * Token verification middleware.
 *
 * Verifies the HMAC-SHA256 signed JWT from the Authorization header and
 * attaches the decoded payload to the Hono context as `auth`.
 *
 * Routes that require authentication should be mounted AFTER this middleware.
 * Public routes (e.g., /api/auth/token) should be mounted BEFORE it.
 */

import { createMiddleware } from "hono/factory";
import { verifyAccessToken, type JwtPayload } from "../lib/jwt";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

// Extend Hono's context variables to include the verified auth payload
declare module "hono" {
  interface ContextVariableMap {
    auth: JwtPayload;
  }
}

/**
 * Middleware that verifies the Bearer token and sets `c.get("auth")`.
 *
 * Returns 401 if:
 * - Authorization header is missing
 * - Token format is invalid
 * - Signature verification fails
 * - Token is expired
 */
export const verifyToken = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const token = authHeader.slice(7);
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const payload = await verifyAccessToken(token, c.env.SESSION_MASTER_KEY);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("auth", payload);
  await next();
});
