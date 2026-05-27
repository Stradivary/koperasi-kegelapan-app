/**
 * Payload Operation Layer Types for the Unified NFC Scanner
 *
 * This module defines the types for the Payload Operation Layer,
 * which handles application-specific CardPayload operations including
 * decryption, validation, business transactions, and tamper detection.
 *
 * @module core/nfc/payloadTypes
 */

import type { CardPayload, SessionGrant } from "../payload/types";
import type { RawNfcResult } from "./types";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for payload operations.
 *
 * - "NO_SESSION": No session grant provided
 * - "SESSION_EXPIRED": Session grant has expired
 * - "TENANT_MISMATCH": Card tenant doesn't match session tenant
 * - "PERMISSION_DENIED": Operation not allowed by session grant
 * - "DECRYPTION_FAILED": Failed to decrypt card data
 * - "VALIDATION_FAILED": Card data validation failed
 * - "WRITE_FAILED": Failed to write updated payload to card
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */
export type PayloadErrorCode =
  | "NO_SESSION"
  | "SESSION_EXPIRED"
  | "TENANT_MISMATCH"
  | "PERMISSION_DENIED"
  | "DECRYPTION_FAILED"
  | "VALIDATION_FAILED"
  | "WRITE_FAILED";

/**
 * Error object for payload operations.
 *
 * Contains detailed information about what went wrong during
 * a payload operation, including whether tampering was detected.
 *
 * @see Requirement 5.5
 */
export interface PayloadError {
  /** Error code identifying the type of error */
  code: PayloadErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether card tampering was detected */
  tamperDetected: boolean;
  /** Whether the error is recoverable (can retry) */
  recoverable: boolean;
}

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Types of business operations that can be performed on a card.
 *
 * - "check-in": Record user check-in at a station
 * - "check-out": Record user check-out from a station
 * - "debit": Deduct balance from the card
 * - "topup": Add balance to the card
 * - "card-issuance": Initialize a new card
 * - "card-repair": Repair a corrupted card
 *
 * @see Requirement 6.1
 */
export type OperationType =
  | "check-in"
  | "check-out"
  | "debit"
  | "topup"
  | "card-issuance"
  | "card-repair";

/**
 * Handler for a custom operation on a card.
 *
 * Operation handlers allow extending the scanner with new business
 * operations without modifying core code. Each handler defines
 * when it's enabled and how to execute the operation.
 *
 * @see Requirement 23.1, 23.5
 */
export interface OperationHandler {
  /** Unique name identifying the operation */
  name: string;
  /** Display label for the operation button */
  label: string;
  /** Optional icon to display with the button */
  icon?: React.ReactNode;
  /** Function to determine if operation is enabled for given payload */
  isEnabled: (payload: CardPayload) => boolean;
  /** Function to execute the operation and return updated payload */
  execute: (payload: CardPayload) => Promise<CardPayload>;
}

// ============================================================================
// Session Validation Types
// ============================================================================

/**
 * Result of validating a session grant.
 *
 * Used to check if a session grant is valid before performing
 * payload operations.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4
 */
export interface SessionValidationResult {
  /** Whether the session is valid */
  valid: boolean;
  /** Human-readable error message if invalid */
  error?: string;
  /** Error code if invalid */
  errorCode?: "NO_SESSION" | "SESSION_EXPIRED" | "TENANT_MISMATCH";
}

// ============================================================================
// Payload Operation Layer Options
// ============================================================================

/**
 * Configuration options for the Payload Operation Layer.
 *
 * @see Requirements 6.1, 7.1
 */
export interface PayloadOperationLayerOptions {
  /** Session grant for encryption/decryption and permissions */
  sessionGrant: SessionGrant | null;
  /** Tenant ID for validation */
  tenantId: string;
  /** Terminal ID for session tracking */
  terminalId: number;
  /** Callback when a card is successfully read and validated */
  onCardRead?: (payload: CardPayload, result: RawNfcResult) => void;
  /** Callback when a write operation succeeds */
  onWriteSuccess?: (payload: CardPayload) => void;
  /** Callback when an error occurs */
  onError?: (error: PayloadError) => void;
}

// Re-export types that consumers might need
export type { CardPayload, SessionGrant } from "../payload/types";
