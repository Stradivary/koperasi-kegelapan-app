import type { ReconciliationEvent } from "#/core/payload/types";

const DB_NAME = "koperasi-wallet";
const DB_VERSION = 5;

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  deviceId: string;
  accountId: string;
  role: string;
  canAccessStation?: boolean;
  terminalId: number;
  updatedAt: number;
}

export interface CardSnapshot {
  tenantId: string;
  cardIdHex: string;
  rawBytes: Uint8Array;
  capturedAt: number;
  serialNumber: string;
}

/**
 * Write-ahead journal entry for NFC card writes.
 * Persisted BEFORE the physical write so recovery is possible on failure.
 * Keyed by [tenantId, cardIdHex] - one pending write per card at a time.
 */
export interface WriteJournal {
  tenantId: string;
  cardIdHex: string;
  serialNumber: string | null;
  /** The prepared bytes ready to write to card */
  rawBytes: Uint8Array;
  /** The expected final payload (for verification after recovery write) */
  expectedPayload: string; // JSON-serialized CardPayload (Uint8Arrays as hex)
  /** The payload BEFORE the write (for rollback display / debugging) */
  previousPayload: string; // JSON-serialized CardPayload
  /** The intended updated payload (before pipeline processing) */
  updatedPayload: string; // JSON-serialized CardPayload
  operationType: string;
  terminalId: number;
  createdAt: number;
  /** How many recovery attempts have been made */
  attempts: number;
  /** 'pending' = write not confirmed, 'recovering' = retry in progress */
  status: "pending" | "recovering";
}

export interface PolicyCache {
  tenantId: string;
  maxTransactionAmount: number;
  maxDailyTotal: number;
  topupOnlineOnly: boolean;
  fetchedAt: number;
  expiresAt: number;
}

// v2: local-only mode stores
export interface LocalTenantConfig {
  tenantId: string;
  slug: string;
  name: string;
  timezone: string;
  /** 'local' = no server; 'synced' = registered with server */
  mode: "local" | "synced";
  serverUrl?: string;
  createdAt: number;
  exportedAt?: number;
  /** Timestamp of last successful sync to server (epoch ms) */
  syncedAt?: number;
  /** Server-assigned tenant ID (may differ from local tenantId) */
  serverTenantId?: string;
}

export interface LocalAccount {
  accountId: string;
  tenantId: string;
  username: string;
  /** Format: "iterations:saltHex:hashHex" (PBKDF2-SHA256) */
  passwordHash: string;
  role: string;
  status: "active" | "inactive";
  createdAt: number;
}

/**
 * Persisted auth token for surviving page refreshes.
 * Keyed by deviceId (one token per device context).
 */
export interface PersistedAuthToken {
  deviceId: string;
  accessToken: string;
  /** Epoch ms when this token expires (0 = no expiry known) */
  expiresAt: number;
  /** Epoch ms when this entry was stored */
  storedAt: number;
}

/**
 * Cached session grant for offline use.
 * Keyed by composite key [tenantId, accountId, deviceId].
 */
export interface CachedSessionGrant {
  tenantId: string;
  accountId: string;
  deviceId: string;
  keyVersion: number;
  /** Base64-encoded session key (stored as string for IndexedDB compatibility) */
  sessionKeyB64: string;
  expiresAt: number;
  allowedOps: string[];
  /** Base64-encoded signature */
  signatureB64: string;
  /** Timestamp when this grant was cached (epoch ms) */
  cachedAt: number;
}
function getIndexedDbFactory(): IDBFactory | null {
  if (typeof globalThis === "undefined") return null;
  return "indexedDB" in globalThis ? globalThis.indexedDB : null;
}

/** Converts an IDBRequest error (DOMException | null) to a proper Error instance. */
function idbError(err: DOMException | null | undefined, fallback: string): Error {
  if (!err) return new Error(fallback);
  return new Error(err.message || fallback);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDbFactory();
    if (!idb) {
      reject(new Error("IndexedDB is not available in this runtime"));
      return;
    }
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onblocked = () => {
      // Another tab/SW holds an older version - reject so callers can handle gracefully
      reject(new Error("IndexedDB upgrade blocked by another connection"));
    };
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // v1 stores
      if (!db.objectStoreNames.contains("tenantContext")) {
        db.createObjectStore("tenantContext", { keyPath: "tenantId" });
      }
      if (!db.objectStoreNames.contains("cardSnapshot")) {
        db.createObjectStore("cardSnapshot", { keyPath: ["tenantId", "cardIdHex"] });
      }
      if (!db.objectStoreNames.contains("policyCache")) {
        db.createObjectStore("policyCache", { keyPath: "tenantId" });
      }
      if (!db.objectStoreNames.contains("reconciliationOutbox")) {
        const outbox = db.createObjectStore("reconciliationOutbox", { keyPath: "idempotencyKey" });
        outbox.createIndex("byTenantId", "tenantId", { unique: false });
        outbox.createIndex("byStatus", "status", { unique: false });
      }
      // v2 stores
      if (!db.objectStoreNames.contains("localTenantConfig")) {
        db.createObjectStore("localTenantConfig", { keyPath: "tenantId" });
      }
      if (!db.objectStoreNames.contains("localAccounts")) {
        const accts = db.createObjectStore("localAccounts", { keyPath: "accountId" });
        accts.createIndex("byTenantId", "tenantId", { unique: false });
        accts.createIndex("byUsername", "username", { unique: true });
      }
      // v3 stores
      if (!db.objectStoreNames.contains("sessionGrantCache")) {
        db.createObjectStore("sessionGrantCache", {
          keyPath: ["tenantId", "accountId", "deviceId"],
        });
      }
      // v4 stores
      if (!db.objectStoreNames.contains("authTokenCache")) {
        db.createObjectStore("authTokenCache", { keyPath: "deviceId" });
      }
      // v5 stores
      if (!db.objectStoreNames.contains("writeJournal")) {
        db.createObjectStore("writeJournal", { keyPath: ["tenantId", "cardIdHex"] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(idbError(req.error, "Failed to open IndexedDB"));
  });
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(idbError(req.error, `IndexedDB tx failed on ${storeName}`));
  });
}

export const tenantContextStore = {
  get: async (tenantId: string) => {
    if (!getIndexedDbFactory()) return undefined;
    return tx<TenantContext | undefined>("tenantContext", "readonly", (s) => s.get(tenantId));
  },
  getAll: async (): Promise<TenantContext[]> => {
    if (!getIndexedDbFactory()) {
      return [];
    }
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("tenantContext", "readonly");
      const req = t.objectStore("tenantContext").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(idbError(req.error, "Failed to getAll tenantContext"));
    });
  },
  put: (ctx: TenantContext) => tx<IDBValidKey>("tenantContext", "readwrite", (s) => s.put(ctx)),
  delete: (tenantId: string) =>
    tx<undefined>("tenantContext", "readwrite", (s) => s.delete(tenantId)),
};

export const cardSnapshotStore = {
  get: async (tenantId: string, cardIdHex: string) => {
    if (!getIndexedDbFactory()) return undefined;
    return tx<CardSnapshot | undefined>("cardSnapshot", "readonly", (s) =>
      s.get([tenantId, cardIdHex]),
    );
  },
  put: (snap: CardSnapshot) => tx<IDBValidKey>("cardSnapshot", "readwrite", (s) => s.put(snap)),
  delete: (tenantId: string, cardIdHex: string) =>
    tx<undefined>("cardSnapshot", "readwrite", (s) => s.delete([tenantId, cardIdHex])),
};

export const writeJournalStore = {
  get: async (tenantId: string, cardIdHex: string): Promise<WriteJournal | undefined> => {
    if (!getIndexedDbFactory()) return undefined;
    return tx<WriteJournal | undefined>("writeJournal", "readonly", (s) =>
      s.get([tenantId, cardIdHex]),
    );
  },
  put: (entry: WriteJournal) => tx<IDBValidKey>("writeJournal", "readwrite", (s) => s.put(entry)),
  delete: (tenantId: string, cardIdHex: string) =>
    tx<undefined>("writeJournal", "readwrite", (s) => s.delete([tenantId, cardIdHex])),
  getAll: async (): Promise<WriteJournal[]> => {
    if (!getIndexedDbFactory()) return [];
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("writeJournal", "readonly");
      const req = t.objectStore("writeJournal").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(idbError(req.error, "Failed to getAll writeJournal"));
    });
  },
};

export const policyCacheStore = {
  get: async (tenantId: string) => {
    if (!getIndexedDbFactory()) return undefined;
    return tx<PolicyCache | undefined>("policyCache", "readonly", (s) => s.get(tenantId));
  },
  put: (policy: PolicyCache) => tx<IDBValidKey>("policyCache", "readwrite", (s) => s.put(policy)),
  delete: (tenantId: string) =>
    tx<undefined>("policyCache", "readwrite", (s) => s.delete(tenantId)),
};

interface OutboxEntry extends ReconciliationEvent {
  tenantId: string;
  terminalId: number;
  status: "pending" | "synced" | "failed";
  createdAt: number;
  attempts: number;
}

export const reconciliationOutbox = {
  add: async (entry: Omit<OutboxEntry, "status" | "createdAt" | "attempts">): Promise<void> => {
    const full: OutboxEntry = { ...entry, status: "pending", createdAt: Date.now(), attempts: 0 };
    await tx<IDBValidKey>("reconciliationOutbox", "readwrite", (s) => s.put(full));
  },

  getPending: async (tenantId: string): Promise<OutboxEntry[]> => {
    if (!getIndexedDbFactory()) {
      return [];
    }
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("reconciliationOutbox", "readonly");
      const store = transaction.objectStore("reconciliationOutbox");
      const index = store.index("byTenantId");
      const req = index.getAll(tenantId);
      req.onsuccess = () =>
        resolve((req.result as OutboxEntry[]).filter((e) => e.status === "pending"));
      req.onerror = () => reject(idbError(req.error, "Failed to getPending outbox"));
    });
  },

  markSynced: async (idempotencyKey: string): Promise<void> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("reconciliationOutbox", "readwrite");
      const store = transaction.objectStore("reconciliationOutbox");
      const req = store.get(idempotencyKey);
      req.onsuccess = () => {
        const entry = req.result as OutboxEntry | undefined;
        if (!entry) {
          resolve();
          return;
        }
        const putReq = store.put({ ...entry, status: "synced" });
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(idbError(putReq.error, "Failed to markSynced outbox entry"));
      };
      req.onerror = () => reject(idbError(req.error, "Failed to get outbox entry for markSynced"));
    });
  },

  clearTenant: async (tenantId: string): Promise<void> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("reconciliationOutbox", "readwrite");
      const store = transaction.objectStore("reconciliationOutbox");
      const index = store.index("byTenantId");
      const req = index.openCursor(IDBKeyRange.only(tenantId));
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else resolve();
      };
      req.onerror = () => reject(idbError(req.error, "Failed to clearTenant outbox"));
    });
  },
};

// ── v2: Local tenant and account stores ────────────────────────────────

export const localTenantConfigStore = {
  get: (tenantId: string) =>
    tx<LocalTenantConfig | undefined>("localTenantConfig", "readonly", (s) => s.get(tenantId)),
  getAll: async (): Promise<LocalTenantConfig[]> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("localTenantConfig", "readonly");
      const req = t.objectStore("localTenantConfig").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(idbError(req.error, "Failed to getAll localTenantConfig"));
    });
  },
  put: (cfg: LocalTenantConfig) =>
    tx<IDBValidKey>("localTenantConfig", "readwrite", (s) => s.put(cfg)),
  delete: (tenantId: string) =>
    tx<undefined>("localTenantConfig", "readwrite", (s) => s.delete(tenantId)),
};

export const localAccountStore = {
  getByUsername: async (username: string): Promise<LocalAccount | undefined> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("localAccounts", "readonly");
      const idx = t.objectStore("localAccounts").index("byUsername");
      const req = idx.get(username);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(idbError(req.error, "Failed to getByUsername localAccounts"));
    });
  },
  getByTenant: async (tenantId: string): Promise<LocalAccount[]> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("localAccounts", "readonly");
      const idx = t.objectStore("localAccounts").index("byTenantId");
      const req = idx.getAll(tenantId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(idbError(req.error, "Failed to getByTenant localAccounts"));
    });
  },
  put: (acct: LocalAccount) => tx<IDBValidKey>("localAccounts", "readwrite", (s) => s.put(acct)),
  delete: (accountId: string) =>
    tx<undefined>("localAccounts", "readwrite", (s) => s.delete(accountId)),
};

// ── v3: Session grant cache store ──────────────────────────────────────

export const sessionGrantCacheStore = {
  get: async (
    tenantId: string,
    accountId: string,
    deviceId: string,
  ): Promise<CachedSessionGrant | undefined> => {
    if (!getIndexedDbFactory()) return undefined;
    return tx<CachedSessionGrant | undefined>("sessionGrantCache", "readonly", (s) =>
      s.get([tenantId, accountId, deviceId]),
    );
  },
  put: (grant: CachedSessionGrant) =>
    tx<IDBValidKey>("sessionGrantCache", "readwrite", (s) => s.put(grant)),
  delete: (tenantId: string, accountId: string, deviceId: string) =>
    tx<undefined>("sessionGrantCache", "readwrite", (s) =>
      s.delete([tenantId, accountId, deviceId]),
    ),
};

// ── v4: Auth token persistence store ───────────────────────────────────

export const authTokenCacheStore = {
  get: async (deviceId: string): Promise<PersistedAuthToken | undefined> => {
    if (!getIndexedDbFactory()) return undefined;
    const entry = await tx<PersistedAuthToken | undefined>("authTokenCache", "readonly", (s) =>
      s.get(deviceId),
    );
    if (!entry) return undefined;
    // Check expiry - if expiresAt is set and passed, discard
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      // Best-effort cleanup of expired token
      try {
        await tx<undefined>("authTokenCache", "readwrite", (s) => s.delete(deviceId));
      } catch {
        // ignore
      }
      return undefined;
    }
    return entry;
  },
  put: (entry: PersistedAuthToken) =>
    tx<IDBValidKey>("authTokenCache", "readwrite", (s) => s.put(entry)),
  delete: (deviceId: string) =>
    tx<undefined>("authTokenCache", "readwrite", (s) => s.delete(deviceId)),
  /** Remove all stored tokens (e.g., on logout). */
  clear: async (): Promise<void> => {
    if (!getIndexedDbFactory()) return;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("authTokenCache", "readwrite");
      const req = transaction.objectStore("authTokenCache").clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(idbError(req.error, "Failed to clear authTokenCache"));
    });
  },
};

export function makeIdempotencyKey(tenantId: string, cardIdHex: string, counter: number): string {
  return `${tenantId}:${cardIdHex}:${counter}`;
}
