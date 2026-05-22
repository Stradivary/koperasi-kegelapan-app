/**
 * Shared token extraction utilities for API middleware and routes.
 *
 * Parses Bearer JWT-like tokens (header.payload.signature) to extract
 * fields from the base64-encoded JSON payload.
 */

/**
 * Extracts the deviceId from the Bearer token payload.
 * Token format: header.payload.signature (JWT-like, base64-encoded JSON payload)
 */
export function extractDeviceIdFromToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.deviceId ?? null;
  } catch {
    return null;
  }
}

export interface TokenPayload {
  tenantId: string;
  accountId: string;
  deviceId?: string;
}

/**
 * Extracts tenantId, accountId, and optional deviceId from the Bearer token payload.
 * Returns null if the token is missing or malformed, or if tenantId/accountId are absent.
 */
export function extractTokenPayload(request: Request): TokenPayload | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.tenantId || !payload.accountId) return null;
    return {
      tenantId: payload.tenantId,
      accountId: payload.accountId,
      deviceId: payload.deviceId ?? undefined,
    };
  } catch {
    return null;
  }
}
