import { localDb, type TransactionLog } from "#/infrastructure/persistence/dexie/localDb";

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
    super(`Duplicate transaction: [tenantId=${tenantId}, cardId=${cardId}, counter=${counter}]`);
    this.name = "DuplicateTransactionError";
  }
}

export class TransactionWriteError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TransactionWriteError";
  }
}

// ── Service ────────────────────────────────────────────────────────────

/**
 * Records a transaction to IndexedDB with syncStatus "pending".
 * Enforces composite uniqueness on [tenantId, cardId, counter].
 * Uses a Dexie transaction to prevent TOCTOU race conditions.
 */
export async function recordTransaction(entry: TransactionInput): Promise<TransactionLog> {
  const record: TransactionLog = {
    ...entry,
    syncStatus: "pending",
    syncedAt: null,
    createdAt: Date.now(),
  };

  return localDb.transaction("rw", localDb.transactionLog, async () => {
    // Check composite uniqueness within the transaction (atomic)
    const existing = await localDb.transactionLog
      .where("[tenantId+cardId+counter]")
      .equals([entry.tenantId, entry.cardId, entry.counter])
      .first();

    if (existing) {
      throw new DuplicateTransactionError(entry.tenantId, entry.cardId, entry.counter);
    }

    const id = await localDb.transactionLog.add(record);
    return { ...record, id: id as number };
  });
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
    if (cardId && !tx.cardId.toLowerCase().includes(cardId.toLowerCase())) return false;
    if (type && tx.type !== type) return false;
    if (dateFrom != null && tx.timestamp < dateFrom) return false;
    if (dateTo != null && tx.timestamp > dateTo) return false;
    if (syncStatus && tx.syncStatus !== syncStatus) return false;
    return true;
  });

  // Get total count for pagination metadata
  const allMatching = await filtered.toArray();

  // Deduplicate by [cardId+counter] - keep the entry with the highest priority syncStatus
  // Priority: synced > pending > conflict > failed (prefer the most "resolved" entry)
  const syncPriority: Record<string, number> = { synced: 3, pending: 2, conflict: 1, failed: 0 };
  const deduped = new Map<string, (typeof allMatching)[number]>();
  for (const tx of allMatching) {
    const key = `${tx.cardId}:${tx.counter}`;
    const existing = deduped.get(key);
    if (
      !existing ||
      (syncPriority[tx.syncStatus] ?? 0) > (syncPriority[existing.syncStatus] ?? 0)
    ) {
      deduped.set(key, tx);
    }
  }
  const uniqueEntries = Array.from(deduped.values());
  const total = uniqueEntries.length;

  // Sort by timestamp descending (newest first)
  uniqueEntries.sort((a, b) => b.timestamp - a.timestamp);

  // Apply pagination
  const offset = (page - 1) * pageSize;
  const entries = uniqueEntries.slice(offset, offset + pageSize);

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
 * Query all entries with syncStatus "pending" or "conflict" for a given tenant.
 * Conflict entries are included for retry — the server's idempotency check
 * will accept them if they were already processed.
 */
export async function getSyncableEntries(tenantId: string): Promise<TransactionLog[]> {
  const pending = await localDb.transactionLog
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "pending"])
    .toArray();

  const conflict = await localDb.transactionLog
    .where("[tenantId+syncStatus]")
    .equals([tenantId, "conflict"])
    .toArray();

  return [...pending, ...conflict];
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
