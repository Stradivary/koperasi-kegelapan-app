/**
 * NFC Adapters Module
 *
 * This module exports all NFC adapter implementations and types.
 * The adapter pattern allows different NFC implementations to be used
 * interchangeably across platforms.
 *
 * @module core/nfc/adapters
 */

// Types and interfaces
export type {
  NfcAdapter,
  NfcCapabilities,
  NfcScanOptions,
  NfcWriteOptions,
  NfcReadingEvent,
  NfcErrorEvent,
  NfcMessage,
  NfcRecord,
  NfcError,
  NfcErrorCode,
} from "./types";

// Adapter implementations
export { WebNfcAdapter } from "./webNfcAdapter";

// Mock adapter for testing
export {
  MockNfcAdapter,
  createMockAdapter,
  createUnsupportedAdapter,
  createSuccessAdapter,
  createErrorAdapter,
  createReadOnlyAdapter,
} from "./mockNfcAdapter";

export type {
  MockScanResponse,
  MockErrorResponse,
  MockWriteResponse,
  MockNfcAdapterConfig,
  MethodCall,
} from "./mockNfcAdapter";
