/**
 * Local-only tenant management.
 *
 * Provides PBKDF2-based account auth, tenant setup, and AES-GCM encrypted
 * export/import for backup and device migration.
 */

import {
  localTenantConfigStore,
  localAccountStore,
  tenantContextStore,
  type LocalTenantConfig,
  type LocalAccount,
} from './indexeddb'

const PBKDF2_ITERATIONS = 310_000
const PBKDF2_HASH = 'SHA-256'
const KEY_LENGTH_BYTES = 32

// ── PBKDF2 password hashing ─────────────────────────────────────────────────

async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  )
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('')
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`
}

async function pbkdf2Verify(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 3) return false
  const [iterStr, saltHex, expectedHex] = parts
  const iterations = parseInt(iterStr, 10)
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  )
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex === expectedHex
}

// ── Tenant setup ─────────────────────────────────────────────────────────────

export interface SetupLocalTenantParams {
  name: string
  slug?: string
  adminUsername: string
  adminPassword: string
  timezone?: string
}

export async function setupLocalTenant(params: SetupLocalTenantParams): Promise<LocalTenantConfig> {
  const tenantId = crypto.randomUUID()
  const slug = params.slug ?? params.name.toLowerCase().replace(/\s+/g, '-')

  const cfg: LocalTenantConfig = {
    tenantId,
    slug,
    name: params.name,
    timezone: params.timezone ?? 'Asia/Jakarta',
    mode: 'local',
    createdAt: Date.now(),
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const passwordHash = await pbkdf2Hash(params.adminPassword, salt)

  const adminAccount: LocalAccount = {
    accountId: crypto.randomUUID(),
    tenantId,
    username: params.adminUsername,
    passwordHash,
    role: 'admin',
    status: 'active',
    createdAt: Date.now(),
  }

  await localTenantConfigStore.put(cfg)
  await localAccountStore.put(adminAccount)

  return cfg
}

// ── Local login ───────────────────────────────────────────────────────────────

export interface LocalLoginResult {
  tenantId: string
  tenantSlug: string
  tenantName: string
  accountId: string
  role: string
}

export async function localLogin(
  username: string,
  password: string,
): Promise<LocalLoginResult | null> {
  const account = await localAccountStore.getByUsername(username)
  if (!account || account.status !== 'active') return null

  const valid = await pbkdf2Verify(password, account.passwordHash)
  if (!valid) return null

  const cfg = await localTenantConfigStore.get(account.tenantId)
  if (!cfg) return null

  return {
    tenantId: cfg.tenantId,
    tenantSlug: cfg.slug,
    tenantName: cfg.name,
    accountId: account.accountId,
    role: account.role,
  }
}

/** Returns true if any local tenant exists (for first-run detection). */
export async function hasLocalTenant(): Promise<boolean> {
  const all = await localTenantConfigStore.getAll()
  return all.length > 0
}

// ── AES-GCM encryption helpers ───────────────────────────────────────────────

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptJson(data: unknown, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(passphrase, salt)
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data)),
  )
  const combined = {
    v: 1,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  }
  return btoa(JSON.stringify(combined))
}

async function decryptJson(blob: string, passphrase: string): Promise<unknown> {
  const combined = JSON.parse(atob(blob))
  const salt = new Uint8Array(combined.salt)
  const iv = new Uint8Array(combined.iv)
  const ciphertext = new Uint8Array(combined.data)
  const key = await deriveAesKey(passphrase, salt)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext))
}

// ── Export / Import ───────────────────────────────────────────────────────────

export interface ExportBundle {
  exportedAt: number
  tenantConfig: LocalTenantConfig
  accounts: LocalAccount[]
}

/**
 * Export tenant data as an encrypted blob.
 *
 * @param tenantId
 * @param passphrase - user-defined OR auto-derived from admin password hash
 */
export async function exportTenant(tenantId: string, passphrase: string): Promise<string> {
  const cfg = await localTenantConfigStore.get(tenantId)
  if (!cfg) throw new Error('Tenant tidak ditemukan')

  const accounts = await localAccountStore.getByTenant(tenantId)
  const bundle: ExportBundle = {
    exportedAt: Date.now(),
    tenantConfig: { ...cfg, exportedAt: Date.now() },
    accounts,
  }

  await localTenantConfigStore.put({ ...cfg, exportedAt: Date.now() })
  return encryptJson(bundle, passphrase)
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
  const accounts = await localAccountStore.getByTenant(tenantId)
  const admin = accounts.find((a) => a.role === 'admin')
  if (!admin) throw new Error('Admin tidak ditemukan')
  // Combine stored hash + password for uniqueness
  return `${admin.passwordHash}:${adminPassword}`
}

export async function importTenant(blob: string, passphrase: string): Promise<LocalTenantConfig> {
  const bundle = (await decryptJson(blob, passphrase)) as ExportBundle
  const { tenantConfig, accounts } = bundle

  await localTenantConfigStore.put(tenantConfig)
  for (const acct of accounts) {
    await localAccountStore.put(acct)
  }

  return tenantConfig
}

/** Trigger browser file download for the encrypted export blob. */
export function downloadExportBlob(blob: string, tenantSlug: string): void {
  const date = new Date().toISOString().slice(0, 10)
  const filename = `kk-backup-${tenantSlug}-${date}.txt`
  const a = document.createElement('a')
  a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(blob)}`
  a.download = filename
  a.click()
}
