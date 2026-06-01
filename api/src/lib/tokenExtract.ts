/**
 * Shared token extraction utilities for API middleware and routes.
 *
 * For pre-auth middleware (device block check, rate limiting) that needs to
 * extract fields BEFORE full verification, uses unsafe decode.
 * For post-auth usage, prefer `c.get("auth")` from the verifyToken middleware.
 */

import { decodeTokenPayloadUnsafe } from "./jwt";

/**
 * Extracts the raw Bearer token string from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
function extractRawToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return token || null;
}

/**
 * Extracts the deviceId from the Bearer token payload (unsafe decode).
 * Used by pre-auth middleware (device block check) that runs before token verification.
 */
export function extractDeviceIdFromToken(request: Request): string | null {
  const token = extractRawToken(request);
  if (!token) return null;
  const payload = decodeTokenPayloadUnsafe(token);
  if (!payload) return null;
  return (payload.deviceId as string) ?? null;
}

export interface TokenPayload {
  tenantId: string;
  accountId: string;
  deviceId?: string;
}

/**
 * Extracts tenantId, accountId, and optional deviceId from the Bearer token payload.
 * Uses unsafe decode - for pre-auth contexts only.
 * For authenticated routes, use `c.get("auth")` instead.
 *
 * @deprecated Prefer using `c.get("auth")` from the verifyToken middleware.
 */
export function extractTokenPayload(request: Request): TokenPayload | null {
  const token = extractRawToken(request);
  if (!token) return null;
  const payload = decodeTokenPayloadUnsafe(token);
  if (!payload) return null;
  if (!payload.tenantId || !payload.accountId) return null;
  return {
    tenantId: payload.tenantId as string,
    accountId: payload.accountId as string,
    deviceId: payload.deviceId as string | undefined,
  };
}
