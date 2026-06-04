// src/hooks/domain.ts - re-exports pure domain functions for UI consumption
export {
  applyDebit,
  applyCheckin,
  applyBlockStatus,
  applyCheckout,
  applyTopup,
  applyResetState,
  isWriteEligible,
  validateTransition,
  validateCheckoutBalance,
  validateTopup,
  MAX_TOPUP_AMOUNT,
  MIN_TOPUP_AMOUNT,
  MIN_ISSUANCE_BALANCE,
  MAX_BALANCE,
  PARKING_RATE_PER_HOUR,
} from "#/core/state-machine/engine";

export { readCard, isNfcSupported, extractCardBytes } from "#/core/nfc/engine";
export { decodePayload, encodePayloadWire } from "#/core/payload/engine";
export { prepareWrite, decryptCardBody } from "#/core/nfc/pipelineEngine";
export { encodeTenantBind } from "#/core/payload/tenantBind";

// Validation & NFC domain functions that require dependency injection
export { checkLocalBlockedStatus } from "#/core/nfc/localStatusCheck";
export { validateUID } from "#/core/validation/uidGlobalValidator";
