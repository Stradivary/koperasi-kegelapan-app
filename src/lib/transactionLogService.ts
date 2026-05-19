import { localDb, type TransactionLog } from "../db/local-db";

// ── Types ──────────────────────────────────────────────────────────────

export interface TransactionQuery {
  tenantId: string;
  cardId?: string;
  type?: TransactionLog["type"];
  dateFrom?: number;
  dateTo?: number;
  syncStatus?: TransactionLog["syncStatus"];
  page: number;
  pageSize: number;
}

export interface PaginatedTransactions {
  entries: TransactionLog[];
  total: number;
  page: number;
  pageSize: number;
}

export type TransactionInput = Omit<TransactionLog, "id" | "syncStatus" | "syncedAt" | "createdAt">;

// ── Errors ─────────────────────────────────────────────────────────────

export class DuplicateTransactionError extends Error {
  constructor(tenantId: string, cardId: string, counter: number) {
    super(
      `Duplicate transaction: [tenantId=${tenantId}, cardId=${cardId}, counter=${counter}]`,
    );
    this.name = "DuplicateTransactionError";
  }
}

export class TransactionWriteError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TransactionWriteError";
  }
}

// ── Service ────────────────────────────────────────────────────────────

/**
 * Records a transaction to IndexedDB with syncStatus "pending".
 * Enforces composite uniqueness on [tenantId, cardId, counter].
 * Retries the write once on failure.
 */
export async function recordTransaction(entry: TransactionInput): Promise<TransactionLog> {
  const record: TransactionLog = {
    ...entry,
    syncStatus: "pending",
    syncedAt: null,
    createdAt: Date.now(),
  };

  // Check composite uniqueness before writing
  const existing = await localDb.transactionLog
    .where("[tenantId+cardId+counter]")
    .equals([entry.tenantId, entry.cardId, entry.counter])
    .first();

  if (existing) {
    throw new DuplicateTransactionError(entry.tenantId, entry.cardId, entry.counter);
  }

  let lastError: unknown;

  // Attempt write with one retry on failure
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const id = await localDb.transactionLog.add(record);
      return { ...record, id: id as number };
    } catch (err: unknown) {
      lastError = err;
      // If it's a constraint violation (duplicate key inserted concurrently), surface immediately
      if (err instanceof Error && err.name === "ConstraintError") {
        throw new DuplicateTransactionError(entry.tenantId, entry.cardId, entry.counter);
      }
      // Only retry once
      if (attempt === 0) continue;
    }
  }

  throw new TransactionWriteError(
    "Failed to persist transaction after retry",
    lastError,
  );
}

/**
 * Paginated query with filters applied as logical AND.
 * All queries are scoped to tenantId.
 */
export async function getTransactions(query: TransactionQuery): Promise<PaginatedTransactions> {
  const { tenantId, cardId, type, dateFrom, dateTo, syncStatus, page, pageSize } = query;

  // Start with a collection scoped to tenantId
  let collection = localDb.transactionLog
    .where("[tenantId+timestamp]")
    .between([tenantId, -Infinity], [tenantId, Infinity], true, true);

  // Apply filters
  let filtered = collection.filter((tx) => {
    if (cardId && tx.cardId.toLowerCase() !== cardId.toLowerCase()) return false;
    if (type && tx.type !== type) return false;
    if (dateFrom != null && tx.timestamp < dateFrom) return false;
    if (dateTo != null && tx.timestamp > dateTo) return false;
    if (syncStatus && tx.syncStatus !== syncStatus) return false;
    return true;
  });

  // Get total count for pagination metadata
  const allMatching = await filtered.toArray();
  const total = allMatching.length;

  // Sort by timestamp descending (newest first)
  allMatching.sort((a, b) => b.timestamp - a.timestamp);

  // Apply pagination
  const offset = (page - 1) * pageSize;
  const entries = allMatching.slice(offset, offset + pageSize);

  return { entries, total, page, pageSize };
}

/**
 * Query all transactions for a specific card within a tenant.
 */
export async function getTransactionsByCard(
  tenantId: string,
  cardId: string,
): Promise<TransactionLog[]> {
  return localDb.transactionLog
    .where("[tenantId+cardId+counter]")
    .between([tenantId, cardId, -Infinity], [tenantId, cardId, Infinity], true, true)
    .toArray();
}

/**
 * Query all entries with syncStatus "pending" for a given tenant.
 */
export async function getSyncableEntries(tenantId: string): Promise<TransactionLog[]> {
  return localDb.transactionLog
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .toArray();
}

/**
 * Update the syncStatus and syncedAt for a transaction by its id.
 */
export async function updateSyncStatus(
  id: number,
  syncStatus: TransactionLog["syncStatus"],
): Promise<void> {
  const updates: Partial<TransactionLog> = { syncStatus };
  if (syncStatus === "synced") {
    updates.syncedAt = Date.now();
  }
  await localDb.transactionLog.update(id, updates);
}
