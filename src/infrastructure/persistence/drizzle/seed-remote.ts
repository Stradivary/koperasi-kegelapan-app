import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { hashPassword, generateId } from "#/core/auth/authRules";

// Check for environment flags
const isStaging = process.argv.includes("--staging");
const configPath = isStaging ? "wrangler.api.staging.jsonc" : "wrangler.api.jsonc";
const environment = isStaging ? "staging" : "production";

console.log(`🌱 Seeding ${environment} D1 database...`);

// Generate IDs and hashes
const systemTenantId = generateId();
const sampleTenantId = generateId();
const superadminId = generateId();
const adminId = generateId();
const superadminHash = hashPassword("superadmin");
const adminHash = hashPassword("password");

// Build SQL statements
const sql = `
-- System tenant (host for superadmin account)
INSERT OR IGNORE INTO tenants (tenant_id, slug, name, status, timezone, created_at, updated_at)
VALUES ('${systemTenantId}', 'system', 'System', 'active', 'Asia/Jakarta', unixepoch(), unixepoch());

-- Sample tenant
INSERT OR IGNORE INTO tenants (tenant_id, slug, name, status, timezone, created_at, updated_at)
VALUES ('${sampleTenantId}', 'koperasi-a', 'Koperasi A', 'active', 'Asia/Jakarta', unixepoch(), unixepoch());

-- Superadmin account (on system tenant)
INSERT OR IGNORE INTO accounts (account_id, tenant_id, username, password_hash, role, status, created_at, updated_at)
SELECT '${superadminId}', tenant_id, 'superadmin', '${superadminHash}', 'superadmin', 'active', unixepoch(), unixepoch()
FROM tenants WHERE slug = 'system';

-- Admin account (on sample tenant)
INSERT OR IGNORE INTO accounts (account_id, tenant_id, username, password_hash, role, status, created_at, updated_at)
SELECT '${adminId}', tenant_id, 'admin-a', '${adminHash}', 'admin', 'active', unixepoch(), unixepoch()
FROM tenants WHERE slug = 'koperasi-a';
`.trim();

// Write SQL to temporary file
const tempFile = join(process.cwd(), ".seed-temp.sql");

try {
  writeFileSync(tempFile, sql);

  // Execute SQL via wrangler
  const command = `wrangler d1 execute DB --remote --config ${configPath} --file=${tempFile}`;

  console.log("Executing seed SQL...");
  execSync(command, { stdio: "inherit" });

  console.log("\n✅ D1 seed complete.");
  console.log("Accounts:");
  console.log('  superadmin  - username: "superadmin", password: "superadmin"');
  console.log('  admin-a     - username: "admin-a", password: "password" (Koperasi A)');
} catch (error) {
  console.error("❌ Seed failed:", error);
  process.exit(1);
} finally {
  // Clean up temp file
  try {
    unlinkSync(tempFile);
  } catch {
    // Ignore cleanup errors
  }
}
