import { getDb } from "#/infrastructure/persistence/drizzle";
import { tenants } from "#/infrastructure/persistence/drizzle/schema";
import { and, eq, like, or, asc } from "drizzle-orm";

export interface TenantSearchResult {
  tenantId: string;
  slug: string;
  name: string;
}

/**
 * Search active tenants by name or slug (case-insensitive LIKE).
 * Returns results ordered alphabetically by tenant name.
 *
 * @param query - Search string (must be >= 2 chars)
 * @param limit - Max results to return (1-50, default 10)
 */
export async function searchServerTenants(
  query: string,
  limit: number = 10,
): Promise<TenantSearchResult[]> {
  const db = getDb();
  const pattern = `%${query}%`;

  const results = await db
    .select({
      tenantId: tenants.tenantId,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(
      and(
        eq(tenants.status, "active"),
        or(like(tenants.name, pattern), like(tenants.slug, pattern)),
      ),
    )
    .orderBy(asc(tenants.name))
    .limit(limit);

  return results;
}
