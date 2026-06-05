import { getDb } from "#/infrastructure/persistence/drizzle";
import { accounts } from "#/infrastructure/persistence/drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface SuperadminAccount {
  accountId: string;
  username: string;
  role: string;
}

/**
 * Extracts and decodes the Bearer token from the Authorization header.
 * Returns the decoded payload or null if missing/invalid.
 *
 * Note: In the new architecture, the verifyToken middleware has already
 * validated the token signature and expiry. This function only decodes
 * the payload for extracting the accountId for the DB role check.
 */
function extractTokenPayload(request: Request): Record<string, unknown> | null {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    // Decode base64url payload
    const b64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const pad = (4 - (b64.length % 4)) % 4;
    const payload = JSON.parse(atob(b64 + "=".repeat(pad)));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authorization guard that verifies the request is from a superadmin account.
 *
 * The verifyToken middleware has already validated the JWT signature and expiry.
 * This function performs the additional authorization check:
 * - Extracts accountId from the (already verified) token
 * - Looks up the account in the DB to confirm superadmin role
 * - Returns 403 if the account doesn't have superadmin role
 *
 * This DB lookup is defense-in-depth: even if a token is valid, the account
 * must still have the superadmin role in the database at request time.
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
