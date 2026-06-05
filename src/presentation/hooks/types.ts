/**
 * Domain type re-exports for UI consumption.
 *
 * UI components should import domain types from this module
 * instead of importing directly from `#/core/` to maintain
 * Clean Architecture boundary rules.
 *
 * @module hooks/types
 */

// Payload types - enums and constants use regular export, interfaces use export type
export type { CardPayload, SessionGrant, LogEntry } from "#/core/payload/types";
export {
  CardState,
  CardStatus,
  TxType,
  MAGIC,
  CARD_SCHEMA_VERSION,
  BUFFER_SIZE,
  WIRE_SIZE,
  TRAILER_COUNTER_BIND,
} from "#/core/payload/types";

// NFC types
export type { NfcPhase } from "#/core/nfc/stateMachine";
export type { CardClassification, RawNfcResult } from "#/core/nfc/types";
export type { NfcError } from "#/core/nfc/adapters/types";
export type { PayloadError, OperationHandler } from "#/core/nfc/payloadTypes";

// Validation types
export type { BlockCheckResult } from "#/core/validation/blockEnforcer";
export type { PrintEligibility } from "#/core/validation/printButtonValidator";
export type { UIDValidationResult } from "#/core/validation/uidGlobalValidator";

// NFC local status
export type { LocalStatusResult } from "#/core/nfc/localStatusCheck";

// IndexedDB types used by UI components
export type {
  TenantContext,
  LocalTenantConfig,
  LocalAccount,
} from "#/infrastructure/persistence/dexie/indexeddb";

// Database types used by UI components
export type { TransactionLog, Card, User } from "#/infrastructure/persistence/dexie/localDb";

// Transaction log service types
export type {
  TransactionQuery,
  PaginatedTransactions,
  TransactionInput,
} from "#/infrastructure/persistence/dexie/transactionLogService";

// Station query types
export type {
  StationCardRow,
  StationUserRow,
} from "#/infrastructure/persistence/dexie/stationQueries";

// Error tracker types
export type { ErrorEvent } from "#/infrastructure/error/errorTracker";
