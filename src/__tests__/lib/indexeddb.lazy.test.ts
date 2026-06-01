/**
 * Tests for src/lib/indexeddb.lazy.ts
 * Covers: all store accessor functions and getIndexedDb
 */
import { describe, expect, it, vi } from "vitest";

// ── Mock the indexeddb module ─────────────────────────────────────────────────

const mockStores = {
  tenantContextStore: { name: "tenantContextStore" },
  cardSnapshotStore: { name: "cardSnapshotStore" },
  writeJournalStore: { name: "writeJournalStore" },
  policyCacheStore: { name: "policyCacheStore" },
  reconciliationOutbox: { name: "reconciliationOutbox" },
  localTenantConfigStore: { name: "localTenantConfigStore" },
  localAccountStore: { name: "localAccountStore" },
  sessionGrantCacheStore: { name: "sessionGrantCacheStore" },
  authTokenCacheStore: { name: "authTokenCacheStore" },
  makeIdempotencyKey: vi.fn(() => "key-123"),
};

vi.mock("#/lib/indexeddb", () => mockStores);

import {
  getAuthTokenCacheStore,
  getCardSnapshotStore,
  getIndexedDb,
  getLocalAccountStore,
  getLocalTenantConfigStore,
  getMakeIdempotencyKey,
  getPolicyCacheStore,
  getReconciliationOutbox,
  getSessionGrantCacheStore,
  getTenantContextStore,
  getWriteJournalStore,
} from "#/lib/indexeddb.lazy";

describe("indexeddb.lazy - store accessors", () => {
  it("getTenantContextStore returns tenantContextStore", async () => {
    const store = await getTenantContextStore();
    expect(store).toBe(mockStores.tenantContextStore);
  });

  it("getCardSnapshotStore returns cardSnapshotStore", async () => {
    const store = await getCardSnapshotStore();
    expect(store).toBe(mockStores.cardSnapshotStore);
  });

  it("getWriteJournalStore returns writeJournalStore", async () => {
    const store = await getWriteJournalStore();
    expect(store).toBe(mockStores.writeJournalStore);
  });

  it("getPolicyCacheStore returns policyCacheStore", async () => {
    const store = await getPolicyCacheStore();
    expect(store).toBe(mockStores.policyCacheStore);
  });

  it("getReconciliationOutbox returns reconciliationOutbox", async () => {
    const store = await getReconciliationOutbox();
    expect(store).toBe(mockStores.reconciliationOutbox);
  });

  it("getLocalTenantConfigStore returns localTenantConfigStore", async () => {
    const store = await getLocalTenantConfigStore();
    expect(store).toBe(mockStores.localTenantConfigStore);
  });

  it("getLocalAccountStore returns localAccountStore", async () => {
    const store = await getLocalAccountStore();
    expect(store).toBe(mockStores.localAccountStore);
  });

  it("getSessionGrantCacheStore returns sessionGrantCacheStore", async () => {
    const store = await getSessionGrantCacheStore();
    expect(store).toBe(mockStores.sessionGrantCacheStore);
  });

  it("getAuthTokenCacheStore returns authTokenCacheStore", async () => {
    const store = await getAuthTokenCacheStore();
    expect(store).toBe(mockStores.authTokenCacheStore);
  });

  it("getMakeIdempotencyKey returns makeIdempotencyKey function", async () => {
    const fn = await getMakeIdempotencyKey();
    expect(fn).toBe(mockStores.makeIdempotencyKey);
  });

  it("getIndexedDb returns the full module", async () => {
    const mod = await getIndexedDb();
    expect(mod.tenantContextStore).toBe(mockStores.tenantContextStore);
    expect(mod.sessionGrantCacheStore).toBe(mockStores.sessionGrantCacheStore);
  });
});

describe("indexeddb.lazy - module caching", () => {
  it("returns the same store instance on repeated calls (module cached)", async () => {
    const s1 = await getTenantContextStore();
    const s2 = await getTenantContextStore();
    expect(s1).toBe(s2);
  });

  it("getIndexedDb returns same module on repeated calls", async () => {
    const m1 = await getIndexedDb();
    const m2 = await getIndexedDb();
    expect(m1).toBe(m2);
  });
});
