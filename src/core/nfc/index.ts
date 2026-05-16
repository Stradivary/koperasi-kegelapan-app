/**
 * NFC Core Module
 *
 * Barrel export for the Unified NFC Scanner core layer.
 * Re-exports all public APIs from the Generic NFC Layer, Payload Operation Layer,
 * state machine, adapters, and types.
 *
 * @module core/nfc
 * @see Requirement 3.1
 */

// Generic NFC Layer
export { GenericNfcLayer } from "./genericNfcLayer";
export type { GenericNfcLayerOptions } from "./genericNfcLayer";

// Card Classifier
export { classify } from "./cardClassifier";

// Pipeline Engine
export {
  readAndValidateCard,
  validateCard,
  prepareWrite,
  commitWrite,
  decryptCardBody,
  recoverFromIncompleteWrite,
} from "./pipelineEngine";
export type { PipelineReadResult, PipelineWriteResult } from "./pipelineEngine";

// Session Validator
export { validateSession } from "./sessionValidator";

// Types
export type { RawNfcResult, CardClassification, WritePhase, NfcTagMetadata } from "./types";

// Payload Types
export type {
  PayloadError,
  PayloadErrorCode,
  OperationType,
  OperationHandler,
  SessionValidationResult,
  PayloadOperationLayerOptions,
} from "./payloadTypes";

// State Machine
export { nfcReducer, initialNfcState } from "./stateMachine";
export type { NfcPhase, NfcState, NfcAction } from "./stateMachine";

// Adapters
export {
  WebNfcAdapter,
  MockNfcAdapter,
  createMockAdapter,
  createUnsupportedAdapter,
  createSuccessAdapter,
  createErrorAdapter,
  createReadOnlyAdapter,
} from "./adapters";
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
  MockScanResponse,
  MockErrorResponse,
  MockWriteResponse,
  MockNfcAdapterConfig,
  MethodCall,
} from "./adapters";
