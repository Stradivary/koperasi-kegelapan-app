import type { ReconciliationEvent } from "../core/payload/types";

const DB_NAME = "koperasi-wallet";
const DB_VERSION = 2;

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  deviceId: string;
  accountId: string;
  role: string;
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
function getIndexedDbFactory(): IDBFactory | null {
  if (typeof globalThis === "undefined") return null;
  return "indexedDB" in globalThis ? globalThis.indexedDB : null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDbFactory();
    if (!idb) {
      reject(new Error("IndexedDB is not available in this runtime"));
      return;
    }
    const req = idb.open(DB_NAME, DB_VERSION);
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
    req.onerror = () => reject(req.error);
  });
}

export const tenantContextStore = {
  get: async (tenantId: string) => {
    if (!getIndexedDbFactory()) return undefined;
    return tx<TenantContext | undefined>("tenantContext", "readonly", (s) => s.get(tenantId));
  },
  getAll: (): Promise<TenantContext[]> =>
    new Promise(async (resolve, reject) => {
      if (!getIndexedDbFactory()) {
        resolve([]);
        return;
      }
      const db = await openDb();
      const t = db.transaction("tenantContext", "readonly");
      const req = t.objectStore("tenantContext").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
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

  getPending: (tenantId: string): Promise<OutboxEntry[]> =>
    new Promise(async (resolve, reject) => {
      if (!getIndexedDbFactory()) {
        resolve([]);
        return;
      }
      const db = await openDb();
      const transaction = db.transaction("reconciliationOutbox", "readonly");
      const store = transaction.objectStore("reconciliationOutbox");
      const index = store.index("byTenantId");
      const req = index.getAll(tenantId);
      req.onsuccess = () =>
        resolve((req.result as OutboxEntry[]).filter((e) => e.status === "pending"));
      req.onerror = () => reject(req.error);
    }),

  markSynced: (idempotencyKey: string) =>
    new Promise<void>(async (resolve, reject) => {
      const db = await openDb();
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
        putReq.onerror = () => reject(putReq.error);
      };
      req.onerror = () => reject(req.error);
    }),

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
      req.onerror = () => reject(req.error);
    });
  },
};

// ── v2: Local tenant and account stores ────────────────────────────────

export const localTenantConfigStore = {
  get: (tenantId: string) =>
    tx<LocalTenantConfig | undefined>("localTenantConfig", "readonly", (s) => s.get(tenantId)),
  getAll: (): Promise<LocalTenantConfig[]> =>
    new Promise(async (resolve, reject) => {
      const db = await openDb();
      const t = db.transaction("localTenantConfig", "readonly");
      const req = t.objectStore("localTenantConfig").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  put: (cfg: LocalTenantConfig) =>
    tx<IDBValidKey>("localTenantConfig", "readwrite", (s) => s.put(cfg)),
  delete: (tenantId: string) =>
    tx<undefined>("localTenantConfig", "readwrite", (s) => s.delete(tenantId)),
};

export const localAccountStore = {
  getByUsername: (username: string): Promise<LocalAccount | undefined> =>
    new Promise(async (resolve, reject) => {
      const db = await openDb();
      const t = db.transaction("localAccounts", "readonly");
      const idx = t.objectStore("localAccounts").index("byUsername");
      const req = idx.get(username);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  getByTenant: (tenantId: string): Promise<LocalAccount[]> =>
    new Promise(async (resolve, reject) => {
      const db = await openDb();
      const t = db.transaction("localAccounts", "readonly");
      const idx = t.objectStore("localAccounts").index("byTenantId");
      const req = idx.getAll(tenantId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  put: (acct: LocalAccount) => tx<IDBValidKey>("localAccounts", "readwrite", (s) => s.put(acct)),
  delete: (accountId: string) =>
    tx<undefined>("localAccounts", "readwrite", (s) => s.delete(accountId)),
};

export function makeIdempotencyKey(tenantId: string, cardIdHex: string, counter: number): string {
  return `${tenantId}:${cardIdHex}:${counter}`;
}
