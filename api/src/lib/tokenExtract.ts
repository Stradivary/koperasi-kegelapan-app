/**
 * Shared token extraction utilities for API middleware and routes.
 *
 * Parses Bearer JWT-like tokens (header.payload.signature) to extract
 * fields from the base64-encoded JSON payload.
 */

/**
 * Parses the JSON payload from a Bearer JWT-like token.
 * Returns null if the Authorization header is missing, malformed, or unparseable.
 */
function parseTokenPayload(request: Request): Record<string, unknown> | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Extracts the deviceId from the Bearer token payload.
 */
export function extractDeviceIdFromToken(request: Request): string | null {
  const payload = parseTokenPayload(request);
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
 * Returns null if the token is missing or malformed, or if tenantId/accountId are absent.
 */
export function extractTokenPayload(request: Request): TokenPayload | null {
  const payload = parseTokenPayload(request);
  if (!payload) return null;
  if (!payload.tenantId || !payload.accountId) return null;
  return {
    tenantId: payload.tenantId as string,
    accountId: payload.accountId as string,
    deviceId: payload.deviceId as string | undefined,
  };
}
