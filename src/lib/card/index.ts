/**
 * NFC Card Operations Core Library
 *
 * Client-side library for NFC card read/write operations including
 * encryption, serialization, business logic, and schema migration.
 */

export {
  encrypt,
  decrypt,
  importKey,
  importHMACKey,
  generateHMAC,
  verifyHMAC,
  decryptWithKeyRotation,
} from './crypto.ts'

export { serialize, deserialize } from './serialization.ts'

export {
  processCheckIn,
  processCheckOut,
  processTopUp,
  initializeCard,
  resetCardStatus,
} from './operations.ts'

export { calculateTariff } from './tariff.ts'

export { appendLog } from './log-buffer.ts'

export { migrateSchema } from './migration.ts'

export type {
  CardPayload,
  TransactionLogEntry,
  CardOperationResult,
  TransactionRecord,
  TenantCardConfig,
} from './types.ts'

export {
  CURRENT_SCHEMA_VERSION,
  MAX_LOG_ENTRIES,
  MAX_PAYLOAD_SIZE,
  AES_GCM_IV_SIZE,
  HMAC_SHA256_SIZE,
  AES_GCM_TAG_SIZE,
} from './types.ts'
