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
import { verifyAccessTokenVerbose, type JwtPayload } from "../lib/jwt";
import { logger } from "../lib/logger";

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
 *
 * Skips verification for:
 * - /api/tenants (public tenant directory)
 * - /api/session-grant?role=scout (scout anonymous browsing)
 * - /api/client-errors (best-effort error reporting)
 */
export const verifyToken = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const path = new URL(c.req.url).pathname;

  // Skip verification for public routes
  if (path.startsWith("/api/tenants") || path.startsWith("/api/client-errors")) {
    return next();
  }

  // Skip verification for session-grant with role=scout
  if (path.startsWith("/api/session-grant")) {
    const url = new URL(c.req.url);
    if (url.searchParams.get("role") === "scout") {
      return next();
    }
  }

  const authHeader = c.req.header("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    logger.warn("auth/401: missing or malformed Authorization header", {
      path,
      method: c.req.method,
      hasHeader: !!c.req.header("authorization"),
      headerPrefix: authHeader.slice(0, 10) || "(empty)",
    });
    return c.json({ error: "Authentication required", reason: "missing_bearer_header" }, 401);
  }

  const token = authHeader.slice(7);
  if (!token) {
    logger.warn("auth/401: empty token after Bearer prefix", {
      path,
      method: c.req.method,
    });
    return c.json({ error: "Authentication required", reason: "empty_token" }, 401);
  }

  const result = await verifyAccessTokenVerbose(token, c.env.SESSION_MASTER_KEY);
  if (!result.ok) {
    logger.warn("auth/401: token verification failed", {
      path,
      method: c.req.method,
      reason: result.reason,
      tokenLength: token.length,
      tokenPrefix: token.slice(0, 20) + "...",
    });
    return c.json({ error: "Invalid or expired token", reason: result.reason }, 401);
  }

  c.set("auth", result.payload);
  await next();
});
