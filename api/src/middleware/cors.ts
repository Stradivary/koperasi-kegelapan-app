import { cors } from "hono/cors";

/**
 * CORS middleware for the API.
 * Allows cross-origin requests from the frontend SPA (deployed on a different domain).
 * Uses a function-based origin check to support pattern matching.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow local development (http and https)
    if (
      origin === "http://localhost:3000" ||
      origin === "https://localhost:3000" ||
      origin === "http://localhost:5173" ||
      origin === "https://localhost:5173"
    ) {
      return origin;
    }
    // Allow Cloudflare Pages deployments (preview and production)
    if (origin.endsWith(".pages.dev")) {
      return origin;
    }
    // Allow Cloudflare Workers (for testing)
    if (origin.endsWith(".workers.dev")) {
      return origin;
    }
    // Allow custom production domain and subdomains
    if (
      origin === "https://ahmadmuzaki.my.id" ||
      origin === "https://ahmadmuzaki.biz.id" ||
      origin.endsWith(".ahmadmuzaki.my.id") ||
      origin.endsWith(".ahmadmuzaki.biz.id")
    ) {
      return origin;
    }
    return null as unknown as string;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
  exposeHeaders: ["X-Request-Id"],
  maxAge: 86400, // 24 hours preflight cache
  credentials: true,
});
