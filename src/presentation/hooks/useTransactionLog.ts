// src/hooks/useTransactionLog.ts
export {
  getTransactions,
  recordTransaction,
} from "#/infrastructure/persistence/dexie/transactionLogService";
export type {
  TransactionQuery,
  PaginatedTransactions,
  TransactionInput,
} from "#/infrastructure/persistence/dexie/transactionLogService";
