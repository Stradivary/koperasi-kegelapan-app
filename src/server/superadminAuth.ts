import { getDb } from "#/db";
import { accounts } from "#/db/schema";
import { eq, and } from "drizzle-orm";

export interface SuperadminAccount {
  accountId: string;
  username: string;
  role: string;
}

/**
 * Extracts and decodes the Bearer token from the Authorization header.
 * Returns the decoded payload or null if missing/invalid.
 */
function extractTokenPayload(request: Request): Record<string, unknown> | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authorization guard that verifies the request is from a superadmin account.
 *
 * - Returns 401 if authentication is missing or invalid
 * - Returns 403 if the authenticated account does not have the "superadmin" role
 * - Returns the authenticated account info on success
 */
export async function requireSuperadmin(request: Request): Promise<SuperadminAccount | Response> {
  const payload = extractTokenPayload(request);

  if (!payload?.accountId) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawAccountId = payload.accountId;
  if (typeof rawAccountId !== "string" && typeof rawAccountId !== "number") {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const accountId = String(rawAccountId);

  const db = getDb();
  const account = await db
    .select({
      accountId: accounts.accountId,
      username: accounts.username,
      role: accounts.role,
    })
    .from(accounts)
    .where(and(eq(accounts.accountId, accountId), eq(accounts.status, "active")))
    .get();

  if (!account) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (account.role !== "superadmin") {
    return new Response(
      JSON.stringify({ error: "Insufficient permissions. Superadmin role required." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  return {
    accountId: account.accountId,
    username: account.username,
    role: account.role,
  };
}

/**
 * Type guard to check if the result of requireSuperadmin is a Response (error).
 */
export function isAuthError(result: SuperadminAccount | Response): result is Response {
  return result instanceof Response;
}
