/**
 * Lazy-loading accessor for IndexedDB stores.
 *
 * All consumers should use this module instead of importing directly from
 * "./indexeddb" to ensure the IndexedDB module lands in its own async chunk.
 * Types can still be imported directly from "./indexeddb" (type-only imports
 * are erased at compile time and don't affect bundling).
 */

// eslint-disable typescript-eslint(consistent-type-imports)
let _mod: typeof import("./indexeddb") | null = null;

async function load() {
  _mod ??= await import("./indexeddb");
  return _mod;
}

// ── Store accessors ──────────────────────────────────────────────────────────

export async function getTenantContextStore() {
  const m = await load();
  return m.tenantContextStore;
}

export async function getCardSnapshotStore() {
  const m = await load();
  return m.cardSnapshotStore;
}

export async function getWriteJournalStore() {
  const m = await load();
  return m.writeJournalStore;
}

export async function getPolicyCacheStore() {
  const m = await load();
  return m.policyCacheStore;
}

export async function getReconciliationOutbox() {
  const m = await load();
  return m.reconciliationOutbox;
}

export async function getLocalTenantConfigStore() {
  const m = await load();
  return m.localTenantConfigStore;
}

export async function getLocalAccountStore() {
  const m = await load();
  return m.localAccountStore;
}

export async function getSessionGrantCacheStore() {
  const m = await load();
  return m.sessionGrantCacheStore;
}

export async function getAuthTokenCacheStore() {
  const m = await load();
  return m.authTokenCacheStore;
}

export async function getMakeIdempotencyKey() {
  const m = await load();
  return m.makeIdempotencyKey;
}

// ── Convenience: load full module (for files needing multiple stores) ────────

export async function getIndexedDb() {
  return load();
}
