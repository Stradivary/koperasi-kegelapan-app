/**
 * Client Error Tracking Route
 *
 * Receives structured error events from the frontend (NFC write failures, etc.)
 * and writes them to Cloudflare Analytics Engine for monitoring and alerting.
 *
 * Analytics Engine schema:
 * - indexes[0]: category (e.g. "nfc_write_failure")
 * - blobs[0]: category
 * - blobs[1]: message (truncated to 200 chars)
 * - blobs[2]: deviceId
 * - blobs[3]: tenantId (from token)
 * - blobs[4]: userAgent (truncated to 200 chars)
 * - doubles[0]: client timestamp (epoch ms)
 * - doubles[1]: server timestamp (epoch ms)
 */

import { Hono } from "hono";

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
  CLIENT_ERRORS_ANALYTICS?: AnalyticsEngineBinding;
};

export const clientErrorsRoute = new Hono<{ Bindings: Env }>();

clientErrorsRoute.post("/", async (c) => {
  let body: {
    category?: string;
    message?: string;
    context?: Record<string, unknown>;
    deviceId?: string;
    timestamp?: number;
    userAgent?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const category = String(body.category ?? "unknown").slice(0, 100);
  const message = String(body.message ?? "").slice(0, 200);
  const deviceId = String(body.deviceId ?? "unknown").slice(0, 64);
  const userAgent = String(body.userAgent ?? "").slice(0, 200);
  const clientTimestamp = typeof body.timestamp === "number" ? body.timestamp : 0;

  // Extract tenantId from token if available
  let tenantId = "unknown";
  const authHeader = c.req.header("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        tenantId = payload.tenantId ?? "unknown";
      }
    } catch {
      // Token parsing failed - continue with "unknown"
    }
  }

  // Write to Analytics Engine if binding is available
  const analytics = c.env.CLIENT_ERRORS_ANALYTICS ?? c.env.SYNC_ANALYTICS;
  if (analytics) {
    try {
      analytics.writeDataPoint({
        indexes: [category],
        blobs: [category, message, deviceId, tenantId, userAgent],
        doubles: [clientTimestamp, Date.now()],
      });
    } catch {
      // Analytics write failure should never break the response
    }
  }

  // Also log to console for wrangler tail / Workers Logs
  console.warn(`[client-error] ${category}: ${message}`, {
    deviceId,
    tenantId,
    clientTimestamp,
  });

  return c.json({ ok: true });
});
