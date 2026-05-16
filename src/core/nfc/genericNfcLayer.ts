/**
 * Generic NFC Layer
 *
 * This module provides a platform-agnostic NFC scanning layer that handles
 * raw NFC operations independent of card format. It abstracts the underlying
 * NFC adapter and provides card classification functionality.
 *
 * Key Features:
 * - Platform-agnostic through NfcAdapter interface
 * - Card classification (empty, foreign, invalid_format, valid_payload, unknown)
 * - Raw scan results with serial number, bytes, and metadata
 * - Write operations with progress feedback
 * - Abort support for all operations
 *
 * @module core/nfc/genericNfcLayer
 * @see Requirements 1.1, 1.2, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 19.4
 */

import type {
  NfcAdapter,
  NfcReadingEvent,
  NfcError,
  NfcWriteOptions,
  NfcRecord,
} from "./adapters/types";
import { WebNfcAdapter } from "./adapters/webNfcAdapter";
import { classify } from "./cardClassifier";
import type { RawNfcResult, CardClassification, WritePhase, NfcTagMetadata } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for configuring the GenericNfcLayer.
 */
export interface GenericNfcLayerOptions {
  /** Custom NFC adapter implementation. Defaults to WebNfcAdapter. */
  adapter?: NfcAdapter;

  /** Callback fired when a raw NFC scan completes, before any payload processing. */
  onRawScan?: (result: RawNfcResult) => void;

  /** Callback fired when an NFC error occurs. */
  onError?: (error: NfcError) => void;

  /** Callback fired during write operations to report progress. */
  onWriteProgress?: (phase: WritePhase) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract raw bytes from the first valid NDEF record.
 * Returns null if no valid data is found.
 */
function extractRawBytes(records: NfcRecord[]): Uint8Array | null {
  for (const record of records) {
    if (record.data && record.data.length > 0) {
      return record.data;
    }
  }
  return null;
}

/**
 * Calculate total bytes across all NDEF records.
 */
function calculateTotalBytes(records: NfcRecord[]): number {
  return records.reduce((total, record) => {
    return total + (record.data?.length ?? 0);
  }, 0);
}

/**
 * Build tag metadata from NDEF records.
 */
function buildMetadata(records: NfcRecord[]): NfcTagMetadata {
  return {
    recordCount: records.length,
    totalBytes: calculateTotalBytes(records),
    hasNdef: records.length > 0,
  };
}

/**
 * Convert an Error to an NfcError structure.
 */
function toNfcError(error: Error): NfcError {
  const name = error.name || "Error";

  // Map error names to NfcErrorCode
  let code: NfcError["code"] = "SCAN_FAILED";
  let recoverable = true;

  if (name === "NotSupportedError") {
    code = "NOT_SUPPORTED";
    recoverable = false;
  } else if (name === "NotAllowedError") {
    code = "PERMISSION_DENIED";
    recoverable = false;
  } else if (name === "AbortError") {
    code = "ABORTED";
    recoverable = false;
  } else if (error.message.toLowerCase().includes("timeout")) {
    code = "TIMEOUT";
    recoverable = true;
  } else if (error.message.toLowerCase().includes("write")) {
    code = "WRITE_FAILED";
    recoverable = true;
  }

  return {
    code,
    message: error.message,
    recoverable,
  };
}

/**
 * Encode a string as UTF-8 bytes for NDEF text record.
 */
function encodeTextRecord(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

// ============================================================================
// GenericNfcLayer Class
// ============================================================================

/**
 * Generic NFC Layer for platform-agnostic NFC operations.
 *
 * This class provides a high-level interface for NFC scanning and writing
 * that works independently of the underlying platform. It uses the NfcAdapter
 * interface to abstract platform-specific implementations.
 *
 * @example
 * ```typescript
 * const nfcLayer = new GenericNfcLayer({
 *   onRawScan: (result) => {
 *     console.log('Card scanned:', result.serialNumber);
 *     console.log('Classification:', result.classification);
 *   },
 *   onError: (error) => {
 *     console.error('NFC error:', error.message);
 *   },
 * });
 *
 * if (nfcLayer.isSupported()) {
 *   const result = await nfcLayer.scan();
 *   console.log('Scan complete:', result);
 * }
 * ```
 *
 * @see Requirements 1.1, 1.2, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 19.4
 */
export class GenericNfcLayer {
  /** The underlying NFC adapter */
  private adapter: NfcAdapter;

  /** Callback for raw scan results */
  private onRawScan?: (result: RawNfcResult) => void;

  /** Callback for errors */
  private onError?: (error: NfcError) => void;

  /** Callback for write progress */
  private onWriteProgress?: (phase: WritePhase) => void;

  /** Current abort controller for cancelling operations */
  private abortController: AbortController | null = null;

  /** Promise resolver for the current scan operation */
  private scanResolver: ((result: RawNfcResult) => void) | null = null;

  /** Promise rejecter for the current scan operation */
  private scanRejecter: ((error: Error) => void) | null = null;

  /**
   * Create a new GenericNfcLayer instance.
   *
   * @param options - Configuration options
   */
  constructor(options?: GenericNfcLayerOptions) {
    // Use provided adapter or default to WebNfcAdapter
    this.adapter = options?.adapter ?? new WebNfcAdapter();

    // Store callbacks
    this.onRawScan = options?.onRawScan;
    this.onError = options?.onError;
    this.onWriteProgress = options?.onWriteProgress;

    // Set up adapter event handlers
    this.setupAdapterHandlers();
  }

  /**
   * Check if NFC is available on this platform.
   *
   * @returns true if NFC is supported and available
   * @see Requirement 18.1
   */
  isSupported(): boolean {
    return this.adapter.isSupported();
  }

  /**
   * Start scanning for NFC tags.
   *
   * This method initiates an NFC scan and returns a promise that resolves
   * with the RawNfcResult when a tag is detected. The onRawScan callback
   * is also fired with the result.
   *
   * @param signal - Optional AbortSignal to cancel the scan
   * @returns Promise resolving to the raw scan result
   * @throws Error if NFC is not supported or scan fails
   * @see Requirements 1.1, 1.2, 1.5, 1.6
   */
  async scan(signal?: AbortSignal): Promise<RawNfcResult> {
    // Check if NFC is supported
    if (!this.isSupported()) {
      const error: NfcError = {
        code: "NOT_SUPPORTED",
        message: "NFC tidak tersedia di perangkat ini.",
        recoverable: false,
      };
      this.onError?.(error);
      throw new Error(error.message);
    }

    // Create abort controller for this scan
    this.abortController = new AbortController();

    // Link external signal if provided
    if (signal) {
      signal.addEventListener("abort", () => {
        this.abortController?.abort();
      });

      if (signal.aborted) {
        const error: NfcError = {
          code: "ABORTED",
          message: "Operasi dibatalkan.",
          recoverable: false,
        };
        this.onError?.(error);
        throw new Error(error.message);
      }
    }

    // Create a promise that will be resolved when a tag is read
    return new Promise<RawNfcResult>((resolve, reject) => {
      this.scanResolver = resolve;
      this.scanRejecter = reject;

      // Start the scan
      this.adapter.scan({ signal: this.abortController!.signal }).catch((error: Error) => {
        this.cleanup();
        const nfcError = toNfcError(error);
        this.onError?.(nfcError);
        reject(error);
      });
    });
  }

  /**
   * Write raw bytes to an NFC tag.
   *
   * This method writes the provided byte array to an NFC tag as an NDEF
   * "unknown" record. Progress is reported through the onWriteProgress callback.
   *
   * @param data - The raw bytes to write
   * @param options - Optional write configuration
   * @throws Error if write fails or is aborted
   * @see Requirements 4.1, 4.3, 4.4, 4.5
   */
  async writeRaw(data: Uint8Array, options?: NfcWriteOptions): Promise<void> {
    // Check if NFC is supported
    if (!this.isSupported()) {
      const error: NfcError = {
        code: "NOT_SUPPORTED",
        message: "NFC tidak tersedia di perangkat ini.",
        recoverable: false,
      };
      this.onError?.(error);
      throw new Error(error.message);
    }

    try {
      // Phase 1: Preparing
      this.onWriteProgress?.("preparing");

      // Phase 2: Waiting for tap
      this.onWriteProgress?.("waiting");

      // Phase 3: Writing
      this.onWriteProgress?.("writing");

      await this.adapter.write(data, options);

      // Phase 4: Complete
      this.onWriteProgress?.("complete");
    } catch (error) {
      const nfcError = toNfcError(error instanceof Error ? error : new Error(String(error)));
      // Override code to WRITE_FAILED for write operations
      nfcError.code = "WRITE_FAILED";
      this.onError?.(nfcError);
      throw error;
    }
  }

  /**
   * Write an NDEF text record to an NFC tag.
   *
   * This is a convenience method for writing text data to NFC tags,
   * primarily useful for testing purposes.
   *
   * @param text - The text to write
   * @param options - Optional write configuration
   * @throws Error if write fails or is aborted
   * @see Requirement 4.2
   */
  async writeText(text: string, options?: NfcWriteOptions): Promise<void> {
    const data = encodeTextRecord(text);
    await this.writeRaw(data, options);
  }

  /**
   * Abort the current NFC operation.
   *
   * This will cancel any ongoing scan or write operation and clean up
   * resources. The operation's promise will reject with an AbortError.
   *
   * @see Requirement 19.4
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.adapter.abort();
    this.cleanup();
  }

  /**
   * Classify card data based on raw bytes and NDEF records.
   *
   * This is a convenience method that exposes the CardClassifier functionality
   * for external use.
   *
   * @param rawBytes - Raw bytes from the first valid NDEF record, or null
   * @param records - All NDEF records from the tag
   * @returns The card classification
   * @see Requirements 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
   */
  classify(rawBytes: Uint8Array | null, records: NfcRecord[]): CardClassification {
    return classify(rawBytes, records);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Set up event handlers on the NFC adapter.
   */
  private setupAdapterHandlers(): void {
    // Handle successful readings
    this.adapter.onReading = (event: NfcReadingEvent) => {
      this.handleReading(event);
    };

    // Handle errors
    this.adapter.onError = (event) => {
      this.handleError(event.error);
    };
  }

  /**
   * Handle a successful NFC reading event.
   */
  private handleReading(event: NfcReadingEvent): void {
    const records = event.message.records;
    const rawBytes = extractRawBytes(records);
    const classification = classify(rawBytes, records);
    const metadata = buildMetadata(records);

    const result: RawNfcResult = {
      serialNumber: event.serialNumber,
      rawBytes,
      records,
      classification,
      metadata,
    };

    // Fire the onRawScan callback before resolving
    // This allows consumers to process the raw result before payload processing
    this.onRawScan?.(result);

    // Resolve the scan promise
    if (this.scanResolver) {
      this.scanResolver(result);
      this.cleanup();
    }
  }

  /**
   * Handle an NFC error event.
   */
  private handleError(error: Error): void {
    const nfcError = toNfcError(error);
    this.onError?.(nfcError);

    // Reject the scan promise if one is pending
    if (this.scanRejecter) {
      this.scanRejecter(error);
      this.cleanup();
    }
  }

  /**
   * Clean up internal state after an operation completes.
   */
  private cleanup(): void {
    this.scanResolver = null;
    this.scanRejecter = null;
    this.abortController = null;
  }
}
