import { eq, and, isNull, gt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { devices, authSessions } from "#/db/schema";
import type { Device, NewDevice } from "#/db/schema";

/**
 * Input for registering a device. Includes the fingerprint attributes
 * and the tenant/account context from the authenticated request.
 */
export interface RegisterDeviceInput {
  tenantId: string;
  accountId: string;
  fingerprintHash: string;
  userAgent: string;
  platform: string;
}

/**
 * Register or update a device record.
 *
 * Upsert logic:
 * - If no device exists for the given (tenantId, accountId, fingerprintHash),
 *   create a new record with a generated UUID.
 * - If a device already exists for that fingerprint+account+tenant combination,
 *   update last_seen_at and return the existing record.
 *
 * @returns The device record (new or existing)
 */
export async function registerDevice(
  db: DrizzleD1Database<Record<string, unknown>>,
  input: RegisterDeviceInput,
): Promise<Device> {
  const now = Math.floor(Date.now() / 1000);

  // Check if device already exists for this fingerprint + account + tenant
  const existing = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.tenantId, input.tenantId),
        eq(devices.accountId, input.accountId),
        eq(devices.fingerprintHash, input.fingerprintHash),
      ),
    )
    .get();

  if (existing) {
    // Update last_seen_at and return existing device
    await db
      .update(devices)
      .set({ lastSeenAt: now, userAgent: input.userAgent, platform: input.platform })
      .where(eq(devices.deviceId, existing.deviceId));

    return { ...existing, lastSeenAt: now, userAgent: input.userAgent, platform: input.platform };
  }

  // Create new device record
  const deviceId = crypto.randomUUID();
  const newDevice: NewDevice = {
    deviceId,
    tenantId: input.tenantId,
    accountId: input.accountId,
    fingerprintHash: input.fingerprintHash,
    userAgent: input.userAgent,
    platform: input.platform,
    lastSeenAt: now,
    blockedUntil: null,
    createdAt: now,
  };

  await db.insert(devices).values(newDevice);

  return newDevice as Device;
}

/**
 * Get all devices registered for a specific account within a tenant.
 */
export async function getDevicesByAccount(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
  accountId: string,
): Promise<Device[]> {
  return db
    .select()
    .from(devices)
    .where(and(eq(devices.tenantId, tenantId), eq(devices.accountId, accountId)))
    .all();
}

/**
 * Get all devices registered within a tenant (superadmin use).
 */
export async function getDevicesByTenant(
  db: DrizzleD1Database<Record<string, unknown>>,
  tenantId: string,
): Promise<Device[]> {
  return db
    .select()
    .from(devices)
    .where(eq(devices.tenantId, tenantId))
    .all();
}

/**
 * Block a device for a specified duration in seconds.
 * Sets blocked_until to now + durationSeconds.
 *
 * @param durationSeconds - Duration in seconds (must be between 60 and 31,536,000)
 */
export async function blockDevice(
  db: DrizzleD1Database<Record<string, unknown>>,
  deviceId: string,
  durationSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const blockedUntil = now + durationSeconds;

  await db
    .update(devices)
    .set({ blockedUntil })
    .where(eq(devices.deviceId, deviceId));
}

/**
 * Unblock a device by setting blocked_until to null.
 */
export async function unblockDevice(
  db: DrizzleD1Database<Record<string, unknown>>,
  deviceId: string,
): Promise<void> {
  await db
    .update(devices)
    .set({ blockedUntil: null })
    .where(eq(devices.deviceId, deviceId));
}

/**
 * Check if a device is currently blocked.
 * A device is blocked if blocked_until is set and greater than the current time.
 * Expired blocks are treated as unblocked.
 *
 * @returns true if the device is currently blocked, false otherwise
 */
export async function isDeviceBlocked(
  db: DrizzleD1Database<Record<string, unknown>>,
  deviceId: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  const device = await db
    .select({ blockedUntil: devices.blockedUntil })
    .from(devices)
    .where(eq(devices.deviceId, deviceId))
    .get();

  if (!device) {
    return false;
  }

  return device.blockedUntil !== null && device.blockedUntil > now;
}

/**
 * Revoke all active (non-revoked, non-expired) auth sessions for a device.
 * Sets revoked_at to the current timestamp on all matching sessions.
 *
 * @returns The number of sessions revoked
 */
export async function revokeDeviceSessions(
  db: DrizzleD1Database<Record<string, unknown>>,
  deviceId: string,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  // Find active sessions: not revoked and not expired
  const activeSessions = await db
    .select({ sessionId: authSessions.sessionId })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.deviceId, deviceId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .all();

  if (activeSessions.length === 0) {
    return 0;
  }

  // Revoke all active sessions for this device
  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.deviceId, deviceId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    );

  return activeSessions.length;
}
