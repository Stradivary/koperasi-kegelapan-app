/**
 * Sync Analytics Middleware — writes structured events to Cloudflare Analytics Engine.
 *
 * Captures sync endpoint metrics: latency, status codes, batch sizes, tenant/device context.
 * Data is queryable via Cloudflare Analytics Engine SQL API or the dashboard.
 *
 * Analytics Engine schema (per data point):
 * - blobs[0]: endpoint (e.g. "sync/push", "sync/pull", "sync/push-entities")
 * - blobs[1]: tenantId
 * - blobs[2]: deviceId
 * - blobs[3]: HTTP method
 * - blobs[4]: error reason (if any)
 * - doubles[0]: response status code
 * - doubles[1]: latency in milliseconds
 * - doubles[2]: request body size (bytes, 0 for GET)
 * - doubles[3]: response body size (bytes, estimated)
 * - doubles[4]: accepted count (for push endpoints)
 * - doubles[5]: rejected count (for push endpoints)
 */

import { createMiddleware } from "hono/factory";

/** Cloudflare Analytics Engine dataset binding interface */
interface AnalyticsEngineDataPoint {
  indexes?: string[];
  blobs?: string[];
  doubles?: number[];
}

interface AnalyticsEngineBinding {
  writeDataPoint(data: AnalyticsEngineDataPoint): void;
}

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
  SYNC_ANALYTICS?: AnalyticsEngineBinding;
};

/**
 * Extract tenantId and deviceId from the Bearer token payload.
 */
function extractTokenInfo(request: Request): { tenantId: string; deviceId: string } {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { tenantId: "unknown", deviceId: "unknown" };

  const token = authHeader.slice(7);
  if (!token) return { tenantId: "unknown", deviceId: "unknown" };

  try {
    const parts = token.split(".");
    if (parts.length < 2) return { tenantId: "unknown", deviceId: "unknown" };
    const payload = JSON.parse(atob(parts[1]));
    return {
      tenantId: payload.tenantId ?? "unknown",
      deviceId: payload.deviceId ?? "unknown",
    };
  } catch {
    return { tenantId: "unknown", deviceId: "unknown" };
  }
}

/**
 * Derive a short endpoint label from the URL path.
 */
function getEndpointLabel(pathname: string): string {
  if (pathname.includes("/push-entities")) return "sync/push-entities";
  if (pathname.includes("/push")) return "sync/push";
  if (pathname.includes("/pull")) return "sync/pull";
  if (pathname.includes("/sse")) return "sync/sse";
  if (pathname.includes("/broadcast")) return "sync/broadcast";
  return "sync/other";
}

/**
 * Parse the response body for push endpoints and extract accepted/rejected counts.
 * Returns { acceptedCount, rejectedCount, responseSize, errorReason }.
 */
async function extractPushCounts(
  endpoint: string,
  response: Response,
): Promise<{ acceptedCount: number; rejectedCount: number; responseSize: number; errorReason: string }> {
  try {
    const cloned = response.clone();
    const body = await cloned.text();
    const responseSize = body.length;
    const parsed = JSON.parse(body);

    let acceptedCount = 0;
    let rejectedCount = 0;

    if (endpoint === "sync/push") {
      acceptedCount = parsed.accepted ?? 0;
      rejectedCount = Array.isArray(parsed.rejected) ? parsed.rejected.length : 0;
    } else if (endpoint === "sync/push-entities") {
      acceptedCount = (parsed.membersAccepted ?? 0) + (parsed.cardsAccepted ?? 0);
      rejectedCount =
        (Array.isArray(parsed.membersRejected) ? parsed.membersRejected.length : 0) +
        (Array.isArray(parsed.cardsRejected) ? parsed.cardsRejected.length : 0);
    }

    const errorReason = parsed.error ? String(parsed.error).slice(0, 100) : "";

    return { acceptedCount, rejectedCount, responseSize, errorReason };
  } catch {
    // Non-critical — skip body parsing
    return { acceptedCount: 0, rejectedCount: 0, responseSize: 0, errorReason: "" };
  }
}

/**
 * Return the final error reason string, falling back to an HTTP status label
 * when no application-level error was captured.
 */
function buildErrorReason(status: number, errorReason: string): string {
  if (status >= 400 && !errorReason) {
    return `http_${status}`;
  }
  return errorReason;
}

/**
 * Analytics middleware for sync endpoints.
 *
 * Writes a data point to Cloudflare Analytics Engine after each request completes.
 * Gracefully no-ops if the SYNC_ANALYTICS binding is not available (e.g., local dev).
 */
export const syncAnalytics = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const analytics = c.env.SYNC_ANALYTICS;

  // No-op if analytics binding is not configured (local dev, tests)
  if (!analytics) {
    await next();
    return;
  }

  const startTime = Date.now();
  const method = c.req.method;
  const pathname = new URL(c.req.url).pathname;
  const endpoint = getEndpointLabel(pathname);
  const { tenantId, deviceId } = extractTokenInfo(c.req.raw);

  // Estimate request body size (Content-Length header or 0)
  const requestSize = Number.parseInt(c.req.header("content-length") ?? "0", 10);

  await next();

  // After response is generated
  const latencyMs = Date.now() - startTime;
  const status = c.res.status;

  // Clone response to read body without consuming it
  // Only attempt for JSON responses on push endpoints
  const isPushJson =
    endpoint.includes("push") && c.res.headers.get("content-type")?.includes("json");

  const { acceptedCount, rejectedCount, responseSize, errorReason: parsedErrorReason } =
    isPushJson
      ? await extractPushCounts(endpoint, c.res)
      : { acceptedCount: 0, rejectedCount: 0, responseSize: 0, errorReason: "" };

  const errorReason = buildErrorReason(status, parsedErrorReason);

  // Write the analytics data point
  try {
    analytics.writeDataPoint({
      indexes: [endpoint],
      blobs: [endpoint, tenantId, deviceId, method, errorReason],
      doubles: [status, latencyMs, requestSize, responseSize, acceptedCount, rejectedCount],
    });
  } catch {
    // Analytics write failure should never break the request
  }
});
