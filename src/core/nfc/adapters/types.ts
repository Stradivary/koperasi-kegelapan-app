/**
 * NFC Adapter Types and Interfaces
 *
 * This module defines the core interfaces for platform-agnostic NFC operations.
 * The adapter pattern allows different NFC implementations (Web NFC, React Native, etc.)
 * to be used interchangeably.
 *
 * @module core/nfc/adapters/types
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Union type of all possible NFC error codes.
 * These codes categorize errors for appropriate handling and recovery.
 */
export type NfcErrorCode =
  | "NOT_SUPPORTED" // NFC not available on this platform/device
  | "PERMISSION_DENIED" // User denied NFC permission
  | "SCAN_FAILED" // Failed to read NFC tag
  | "WRITE_FAILED" // Failed to write to NFC tag
  | "ABORTED" // Operation was cancelled by user or system
  | "TIMEOUT"; // Operation timed out

/**
 * Structured NFC error with code, message, and recovery information.
 */
export interface NfcError {
  /** Error code for programmatic handling */
  code: NfcErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether the error can be recovered by retrying */
  recoverable: boolean;
}

// ============================================================================
// NFC Message Types
// ============================================================================

/**
 * Represents a single NDEF record from an NFC tag.
 * NDEF (NFC Data Exchange Format) is the standard format for NFC data.
 */
export interface NfcRecord {
  /** The type of record (e.g., "text", "url", "mime", "unknown") */
  recordType: string;
  /** The raw data bytes of the record, or null if empty */
  data: Uint8Array | null;
}

/**
 * Represents an NDEF message containing one or more records.
 */
export interface NfcMessage {
  /** Array of NDEF records in the message */
  records: NfcRecord[];
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event fired when an NFC tag is successfully read.
 */
export interface NfcReadingEvent {
  /** The unique serial number (UID) of the NFC tag */
  serialNumber: string;
  /** The NDEF message read from the tag */
  message: NfcMessage;
}

/**
 * Event fired when an NFC error occurs.
 */
export interface NfcErrorEvent {
  /** The error that occurred */
  error: Error;
}

// ============================================================================
// Options Types
// ============================================================================

/**
 * Options for NFC scan operations.
 */
export interface NfcScanOptions {
  /** AbortSignal to cancel the scan operation */
  signal?: AbortSignal;
}

/**
 * Options for NFC write operations.
 */
export interface NfcWriteOptions {
  /** AbortSignal to cancel the write operation */
  signal?: AbortSignal;
  /** Whether to overwrite existing data on the tag (default: false) */
  overwrite?: boolean;
}

// ============================================================================
// Capability Types
// ============================================================================

/**
 * Describes the capabilities of an NFC adapter.
 */
export interface NfcCapabilities {
  /** Whether the adapter can read NFC tags */
  canRead: boolean;
  /** Whether the adapter can write to NFC tags */
  canWrite: boolean;
  /** List of supported NDEF record types */
  supportedRecordTypes: string[];
}

// ============================================================================
// Adapter Interface
// ============================================================================

/**
 * Platform-agnostic interface for NFC operations.
 *
 * Implementations of this interface provide the actual NFC functionality
 * for different platforms (Web NFC API, React Native NFC, etc.).
 *
 * @example
 * ```typescript
 * const adapter: NfcAdapter = new WebNfcAdapter();
 *
 * if (adapter.isSupported()) {
 *   adapter.onReading = (event) => {
 *     console.log('Tag scanned:', event.serialNumber);
 *   };
 *   adapter.onError = (event) => {
 *     console.error('NFC error:', event.error);
 *   };
 *   await adapter.scan();
 * }
 * ```
 */
export interface NfcAdapter {
  /**
   * Check if NFC is available on this platform.
   * @returns true if NFC is supported and available
   */
  isSupported(): boolean;

  /**
   * Get the capabilities of this adapter.
   * @returns NfcCapabilities describing what operations are supported
   */
  getCapabilities(): NfcCapabilities;

  /**
   * Start scanning for NFC tags.
   * When a tag is detected, the onReading callback will be invoked.
   * @param options - Optional scan configuration
   * @throws Error if NFC is not supported or permission is denied
   */
  scan(options?: NfcScanOptions): Promise<void>;

  /**
   * Write data to an NFC tag.
   * The tag must be in range when this method is called.
   * @param data - The raw bytes to write to the tag
   * @param options - Optional write configuration
   * @throws Error if write fails or is aborted
   */
  write(data: Uint8Array, options?: NfcWriteOptions): Promise<void>;

  /**
   * Abort any ongoing NFC operation (scan or write).
   * This will cause the operation's promise to reject with an ABORTED error.
   */
  abort(): void;

  /**
   * Callback invoked when an NFC tag is successfully read.
   * Set this before calling scan() to receive reading events.
   */
  onReading: ((event: NfcReadingEvent) => void) | null;

  /**
   * Callback invoked when an NFC error occurs.
   * Set this before calling scan() or write() to receive error events.
   */
  onError: ((event: NfcErrorEvent) => void) | null;
}
