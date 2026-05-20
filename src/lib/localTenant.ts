/**
 * Local-only tenant management.
 *
 * Provides PBKDF2-based account auth, tenant setup, and AES-GCM encrypted
 * export/import for backup and device migration.
 */

import {
  localAccountStore,
  localTenantConfigStore,
  type LocalAccount,
  type LocalTenantConfig,
} from "./indexeddb";
import { createSlug, validateSlugFormat } from "./slugValidation";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = "SHA-256";
const KEY_LENGTH_BYTES = 32;

// ── PBKDF2 password hashing ─────────────────────────────────────────────────

async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

async function pbkdf2Verify(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;
  const [iterStr, saltHex, expectedHex] = parts;
  const iterations = parseInt(iterStr, 10);
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex === expectedHex;
}

// ── Tenant setup ─────────────────────────────────────────────────────────────

/** Check if a slug is already used by an existing local tenant. */
export async function isLocalSlugTaken(slug: string): Promise<boolean> {
  const existingTenants = await localTenantConfigStore.getAll();
  return existingTenants.some((t) => t.slug === slug);
}

/**
 * Check if a slug already exists on the remote server.
 * Calls the tenant search endpoint and checks for an exact slug match.
 * Returns false (not taken) if the network request fails (offline-tolerant).
 */
export async function isRemoteSlugTaken(slug: string): Promise<boolean> {
  try {
    const { API_BASE_URL } = await import("./api");
    const res = await fetch(
      `${API_BASE_URL}/api/tenants/search?q=${encodeURIComponent(slug)}&limit=10`,
    );
    if (!res.ok) return false;
    const data = await res.json();
    const tenants: { slug?: string }[] = data.tenants ?? data.results ?? data ?? [];
    return tenants.some((t) => t.slug === slug);
  } catch {
    // Network error / offline — allow proceeding
    return false;
  }
}

/**
 * Check if a slug is taken either locally or on the remote server.
 * Combines both checks for comprehensive slug uniqueness validation.
 */
export async function isSlugTaken(
  slug: string,
): Promise<{ taken: boolean; source?: "local" | "remote" }> {
  const localTaken = await isLocalSlugTaken(slug);
  if (localTaken) return { taken: true, source: "local" };

  const remoteTaken = await isRemoteSlugTaken(slug);
  if (remoteTaken) return { taken: true, source: "remote" };

  return { taken: false };
}

export interface SetupLocalTenantParams {
  name: string;
  slug?: string;
  adminUsername: string;
  adminPassword: string;
  timezone?: string;
}

export async function setupLocalTenant(params: SetupLocalTenantParams): Promise<LocalTenantConfig> {
  const tenantId = crypto.randomUUID();
  const slug = params.slug ?? createSlug(params.name);

  // Validate slug format (min 3 chars, valid characters, etc.)
  const slugError = validateSlugFormat(slug);
  if (slugError) {
    throw new Error(slugError);
  }

  // Validate slug uniqueness among existing local tenants
  const existingTenants = await localTenantConfigStore.getAll();
  const duplicate = existingTenants.find((t) => t.slug === slug);
  if (duplicate) {
    throw new Error(`Slug "${slug}" sudah digunakan oleh koperasi "${duplicate.name}".`);
  }

  const cfg: LocalTenantConfig = {
    tenantId,
    slug,
    name: params.name,
    timezone: params.timezone ?? "Asia/Jakarta",
    mode: "local",
    createdAt: Date.now(),
  };

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await pbkdf2Hash(params.adminPassword, salt);

  const adminAccount: LocalAccount = {
    accountId: crypto.randomUUID(),
    tenantId,
    username: params.adminUsername,
    passwordHash,
    role: "admin",
    status: "active",
    createdAt: Date.now(),
  };

  await localTenantConfigStore.put(cfg);
  await localAccountStore.put(adminAccount);

  return cfg;
}

// ── Local login ───────────────────────────────────────────────────────────────

export interface LocalLoginResult {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  accountId: string;
  role: string;
}

export async function localLogin(
  username: string,
  password: string,
  tenantSlug?: string,
): Promise<LocalLoginResult | null> {
  const account = await localAccountStore.getByUsername(username);
  if (!account || account.status !== "active") return null;

  const valid = await pbkdf2Verify(password, account.passwordHash);
  if (!valid) return null;

  const cfg = await localTenantConfigStore.get(account.tenantId);
  if (!cfg) return null;

  // If a tenant slug was specified, verify the account belongs to that tenant
  if (tenantSlug && cfg.slug !== tenantSlug) {
    return null;
  }

  return {
    tenantId: cfg.tenantId,
    tenantSlug: cfg.slug,
    tenantName: cfg.name,
    accountId: account.accountId,
    role: account.role,
  };
}

/** Returns true if any local tenant exists (for first-run detection). */
export async function hasLocalTenant(): Promise<boolean> {
  const all = await localTenantConfigStore.getAll();
  return all.length > 0;
}

// ── Cache server credentials for offline replay ──────────────────────────────

export interface CacheServerCredentialsParams {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  accountId: string;
  role: string;
  username: string;
  password: string;
}

/**
 * Cache server-authenticated credentials locally so the user can log in
 * offline on subsequent visits. Upserts both the local account and tenant config.
 *
 * - If the account already exists locally (same username), updates the password hash and role.
 * - If the tenant config doesn't exist, creates one with mode="synced".
 * - If it exists, updates syncedAt timestamp.
 *
 * This is fire-and-forget safe — failures here don't block login.
 */
export async function cacheServerCredentials(params: CacheServerCredentialsParams): Promise<void> {
  const { tenantId, tenantSlug, tenantName, accountId, role, username, password } = params;

  // Hash password client-side using the same PBKDF2 format as local accounts
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await pbkdf2Hash(password, salt);

  // Upsert local account — check if username already exists
  const existing = await localAccountStore.getByUsername(username);
  if (existing) {
    // Update existing account with fresh password hash and role
    await localAccountStore.put({
      ...existing,
      tenantId,
      passwordHash,
      role,
      status: "active",
    });
  } else {
    // Create new local account entry
    await localAccountStore.put({
      accountId,
      tenantId,
      username,
      passwordHash,
      role,
      status: "active",
      createdAt: Date.now(),
    });
  }

  // Ensure LocalTenantConfig exists for this tenant
  const existingConfig = await localTenantConfigStore.get(tenantId);
  if (!existingConfig) {
    await localTenantConfigStore.put({
      tenantId,
      slug: tenantSlug,
      name: tenantName,
      timezone: "Asia/Jakarta",
      mode: "synced",
      createdAt: Date.now(),
      syncedAt: Date.now(),
      serverTenantId: tenantId,
    });
  } else {
    // Update sync timestamp and name (may have changed on server)
    await localTenantConfigStore.put({
      ...existingConfig,
      name: tenantName,
      slug: tenantSlug,
      syncedAt: Date.now(),
    });
  }
}

// ── AES-GCM encryption helpers ───────────────────────────────────────────────

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptJson(data: unknown, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  const combined = {
    v: 1,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };
  return btoa(JSON.stringify(combined));
}

async function decryptJson(blob: string, passphrase: string): Promise<unknown> {
  const combined = JSON.parse(atob(blob));
  const salt = new Uint8Array(combined.salt);
  const iv = new Uint8Array(combined.iv);
  const ciphertext = new Uint8Array(combined.data);
  const key = await deriveAesKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ── Export / Import ───────────────────────────────────────────────────────────

export interface ExportBundle {
  exportedAt: number;
  tenantConfig: LocalTenantConfig;
  accounts: LocalAccount[];
}

/**
 * Export tenant data as an encrypted blob.
 *
 * @param tenantId
 * @param passphrase - user-defined OR auto-derived from admin password hash
 */
export async function exportTenant(tenantId: string, passphrase: string): Promise<string> {
  const cfg = await localTenantConfigStore.get(tenantId);
  if (!cfg) throw new Error("Tenant tidak ditemukan");

  const accounts = await localAccountStore.getByTenant(tenantId);
  const bundle: ExportBundle = {
    exportedAt: Date.now(),
    tenantConfig: { ...cfg, exportedAt: Date.now() },
    accounts,
  };

  await localTenantConfigStore.put({ ...cfg, exportedAt: Date.now() });
  return encryptJson(bundle, passphrase);
}

/**
 * Derive an export passphrase from the admin password.
 * Uses the admin account's stored hash as the passphrase seed so
 * the same admin can restore without remembering a separate passphrase.
 */
export async function deriveExportPassphrase(
  tenantId: string,
  adminPassword: string,
): Promise<string> {
  const accounts = await localAccountStore.getByTenant(tenantId);
  const admin = accounts.find((a) => a.role === "admin");
  if (!admin) throw new Error("Admin tidak ditemukan");
  // Combine stored hash + password for uniqueness
  return `${admin.passwordHash}:${adminPassword}`;
}

export async function importTenant(blob: string, passphrase: string): Promise<LocalTenantConfig> {
  const bundle = (await decryptJson(blob, passphrase)) as ExportBundle;
  const { tenantConfig, accounts } = bundle;

  await localTenantConfigStore.put(tenantConfig);
  for (const acct of accounts) {
    await localAccountStore.put(acct);
  }

  return tenantConfig;
}

/** Trigger browser file download for the encrypted export blob. */
export function downloadExportBlob(blob: string, tenantSlug: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `kk-backup-${tenantSlug}-${date}.txt`;
  const a = document.createElement("a");
  a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(blob)}`;
  a.download = filename;
  a.click();
}
