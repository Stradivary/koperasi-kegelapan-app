import { cors } from "hono/cors";

/**
 * Allowed origins for CORS.
 *
 * Restricted to specific project deployments rather than wildcards.
 * Update this list when adding new deployment targets.
 */
const ALLOWED_ORIGINS = new Set([
  // Local development
  "http://localhost:3000",
  "https://localhost:3000",
  "http://localhost:5173",
  "https://localhost:5173",
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://127.0.0.1:5173",
  "https://192.168.100.196:3000",
  // Production domains
  "https://ahmadmuzaki.my.id",
  "https://ahmadmuzaki.biz.id",
]);

/**
 * Allowed origin suffixes for subdomain matching.
 * Only matches specific project subdomains, not all *.pages.dev.
 */
const ALLOWED_SUBDOMAIN_PATTERNS = [".ahmadmuzaki.my.id", ".ahmadmuzaki.biz.id"];

/**
 * Allowed Cloudflare Pages project prefixes.
 * Matches preview deployments like `abc123.koperasi-kegelapan.pages.dev`.
 */
const ALLOWED_PAGES_PROJECTS = ["koperasi-kegelapan.pages.dev"];

/**
 * Check if an origin matches an allowed Cloudflare Pages project.
 * Matches both the root project domain and preview deployment subdomains.
 */
function isAllowedPagesOrigin(origin: string): boolean {
  for (const project of ALLOWED_PAGES_PROJECTS) {
    // Exact match: https://koperasi-kegelapan.pages.dev
    if (origin === `https://${project}`) return true;
    // Preview deployment: https://<hash>.koperasi-kegelapan.pages.dev
    if (origin.endsWith(`.${project}`) && origin.startsWith("https://")) return true;
  }
  return false;
}

/**
 * CORS middleware for the API.
 *
 * Security improvements over previous version:
 * - No longer allows ALL *.pages.dev (any Cloudflare user's deployment)
 * - No longer allows ALL *.workers.dev
 * - Only allows specific project Pages deployments
 * - Subdomain matching restricted to owned domains
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Exact match against allowed origins
    if (ALLOWED_ORIGINS.has(origin)) {
      return origin;
    }

    // Check subdomain patterns (owned domains only)
    for (const suffix of ALLOWED_SUBDOMAIN_PATTERNS) {
      if (origin.endsWith(suffix) && origin.startsWith("https://")) {
        return origin;
      }
    }

    // Check Cloudflare Pages project deployments
    if (isAllowedPagesOrigin(origin)) {
      return origin;
    }
    console.log("cross site invalid:" + origin);
    return null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
  exposeHeaders: ["X-Request-Id"],
  maxAge: 86400, // 24 hours preflight cache
  credentials: true,
});
