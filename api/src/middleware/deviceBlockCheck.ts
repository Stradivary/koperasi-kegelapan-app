import { createMiddleware } from "hono/factory";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { devices } from "#/db/schema";
import { extractDeviceIdFromToken } from "../lib/tokenExtract";

type Env = {
  DB: D1Database;
  SESSION_MASTER_KEY: string;
};

/**
 * Middleware that checks if the requesting device is blocked.
 *
 * On every authenticated request:
 * 1. Extracts device_id from the JWT token payload
 * 2. Queries the devices table to check if blocked_until > current time
 * 3. If blocked: returns 403 with { error: "device_blocked", blockedUntil }
 * 4. If not blocked or block expired: passes through to next handler
 * 5. Skips the check if no device_id is present (backward compatibility)
 */
export const deviceBlockCheck = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const deviceId = extractDeviceIdFromToken(c.req.raw);

  // Skip check if no device_id present (backward compatibility)
  if (!deviceId) {
    await next();
    return;
  }

  const db = drizzle(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  const device = await db
    .select({ blockedUntil: devices.blockedUntil })
    .from(devices)
    .where(eq(devices.deviceId, deviceId))
    .get();

  // If device not found in registry, allow through (not yet registered)
  if (!device) {
    await next();
    return;
  }

  // Check if device is currently blocked
  if (device.blockedUntil !== null && device.blockedUntil > now) {
    return c.json({ error: "device_blocked", blockedUntil: device.blockedUntil }, 403);
  }

  // Device is not blocked (or block has expired) - proceed
  await next();
});
