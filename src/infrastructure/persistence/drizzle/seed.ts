import { config } from "dotenv";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { hashPassword, generateId } from "#/core/auth/authRules";

config({ path: [".env.local", ".env"] });

async function seed() {
  // Check for environment flags
  const isRemote = process.argv.includes("--remote");
  const isRemoteStage = process.argv.includes("--remote-stage");

  // Determine which config to use
  const configPath = isRemoteStage ? "wrangler.api.staging.jsonc" : "wrangler.api.jsonc";

  let environment: string;
  if (isRemoteStage) {
    environment = "staging";
  } else if (isRemote) {
    environment = "production";
  } else {
    environment = "local";
  }

  console.log(`🌱 Seeding ${environment} D1 database...`);

  const { env, dispose } = await getPlatformProxy<CloudflareEnv>({
    configPath,
    ...(isRemote || isRemoteStage ? { persist: true } : {}),
  });
  const db = drizzle(env.DB, { schema });

  console.log("🌱 Seeding D1 database...");

  // ── System tenant (host for superadmin account) ────────────────────────────
  const systemTenant = {
    tenantId: generateId(),
    slug: "system",
    name: "System",
    status: "active" as const,
    timezone: "Asia/Jakarta",
  };

  await db
    .insert(schema.tenants)
    .values(systemTenant)
    .onConflictDoNothing({ target: schema.tenants.slug });

  const { eq } = await import("drizzle-orm");
  const persistedSystem = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, "system"))
    .get();

  if (!persistedSystem) throw new Error("Unable to resolve system tenant row");

  // ── Sample tenant ──────────────────────────────────────────────────────────
  const sampleTenant = {
    tenantId: generateId(),
    slug: "koperasi-a",
    name: "Koperasi A",
    status: "active" as const,
    timezone: "Asia/Jakarta",
  };

  await db
    .insert(schema.tenants)
    .values(sampleTenant)
    .onConflictDoNothing({ target: schema.tenants.slug });

  const persistedSample = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, "koperasi-a"))
    .get();

  if (!persistedSample) throw new Error("Unable to resolve sample tenant row");

  console.log("✓ Tenants: System, Koperasi A");

  // ── Superadmin account (on system tenant) ──────────────────────────────────
  const superadminAccount = {
    accountId: generateId(),
    tenantId: persistedSystem.tenantId,
    username: "superadmin",
    passwordHash: hashPassword("superadmin"),
    role: "superadmin" as const,
    status: "active" as const,
  };

  await db.insert(schema.accounts).values(superadminAccount).onConflictDoNothing();
  console.log('✓ Superadmin: username "superadmin", password "superadmin"');

  // ── Admin account (on sample tenant) ───────────────────────────────────────
  const adminAccount = {
    accountId: generateId(),
    tenantId: persistedSample.tenantId,
    username: "admin-a",
    passwordHash: hashPassword("password"),
    role: "admin" as const,
    status: "active" as const,
  };

  await db.insert(schema.accounts).values(adminAccount).onConflictDoNothing();
  console.log('✓ Admin: username "admin-a", password "password" (Koperasi A)');

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n✅ D1 seed complete (${environment}).`);
  console.log("Accounts:");
  console.log('  superadmin  - username: "superadmin", password: "superadmin"');
  console.log('  admin-a     - username: "admin-a", password: "password" (Koperasi A)');

  await dispose();
}

await seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
