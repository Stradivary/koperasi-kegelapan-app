/**
 * Web NFC Adapter Implementation
 *
 * This module provides an NfcAdapter implementation using the Web NFC API (NDEFReader).
 * Web NFC is only available in Chrome on Android over HTTPS (or localhost).
 *
 * @module core/nfc/adapters/webNfcAdapter
 */

import type {
  NfcAdapter,
  NfcCapabilities,
  NfcScanOptions,
  NfcWriteOptions,
  NfcReadingEvent,
  NfcErrorEvent,
  NfcMessage,
  NfcRecord,
} from "./types";

// ============================================================================
// Web NFC Type Declarations
// ============================================================================

/**
 * NDEFReader interface from the Web NFC API.
 * Declared here to avoid global pollution and provide type safety.
 */
interface WebNDEFReader {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(
    message: WebNDEFMessageInit,
    options?: { signal?: AbortSignal; overwrite?: boolean },
  ): Promise<void>;
  addEventListener(type: "reading", handler: (event: WebNDEFReadingEvent) => void): void;
  addEventListener(type: "readingerror", handler: (event: WebNDEFErrorEvent) => void): void;
  removeEventListener(type: "reading", handler: (event: WebNDEFReadingEvent) => void): void;
  removeEventListener(type: "readingerror", handler: (event: WebNDEFErrorEvent) => void): void;
}

interface WebNDEFReadingEvent extends Event {
  serialNumber: string;
  message: WebNDEFMessage;
}

interface WebNDEFErrorEvent extends Event {
  error: DOMException;
}

interface WebNDEFMessage {
  records: WebNDEFRecord[];
}

interface WebNDEFRecord {
  recordType: string;
  data: DataView | null;
}

interface WebNDEFMessageInit {
  records: Array<{ recordType: string; data: BufferSource }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if NDEFReader is available in the current environment.
 */
function getNDEFReaderConstructor(): (new () => WebNDEFReader) | null {
  if (typeof globalThis !== "undefined" && "NDEFReader" in globalThis) {
    return (globalThis as unknown as { NDEFReader: new () => WebNDEFReader }).NDEFReader;
  }
  return null;
}

/**
 * Convert a WebNDEFRecord to our NfcRecord type.
 */
function convertRecord(webRecord: WebNDEFRecord): NfcRecord {
  let data: Uint8Array | null = null;

  if (webRecord.data) {
    const dataView = webRecord.data;
    data = new Uint8Array(
      dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength),
    );
  }

  return {
    recordType: webRecord.recordType,
    data,
  };
}

/**
 * Convert a WebNDEFMessage to our NfcMessage type.
 */
function convertMessage(webMessage: WebNDEFMessage): NfcMessage {
  return {
    records: webMessage.records.map(convertRecord),
  };
}

/**
 * Create a user-friendly error message from a DOMException.
 */
function friendlyErrorMessage(error: DOMException | Error): string {
  const message = error.message.toLowerCase();
  const name = error.name;

  // Permission errors
  if (name === "NotAllowedError" || message.includes("permission")) {
    return "Izin NFC ditolak. Aktifkan NFC di pengaturan perangkat.";
  }

  // Abort errors
  if (name === "AbortError" || message.includes("aborted")) {
    return "Operasi dibatalkan.";
  }

  // Not supported errors
  if (name === "NotSupportedError") {
    if (message.includes("ndef")) {
      return "Kartu tidak kompatibel NDEF. Gunakan kartu NTAG213/215/216.";
    }
    return "NFC tidak didukung di perangkat ini.";
  }

  // I/O errors (card moved during operation)
  if (message.includes("io") || message.includes("i/o")) {
    return "Gagal: kartu dipindahkan terlalu cepat. Tahan kartu sampai proses selesai.";
  }

  // NDEF-related errors
  if (message.includes("not ndef") || message.includes("ndef")) {
    return "Kartu tidak memiliki data NDEF yang valid.";
  }

  // Timeout errors
  if (message.includes("timeout")) {
    return "Waktu habis. Coba lagi.";
  }

  // Network/connection errors
  if (message.includes("network") || message.includes("connection")) {
    return "Koneksi NFC terputus. Coba lagi.";
  }

  // Default: return the original message
  return error.message || "Terjadi kesalahan NFC.";
}

// ============================================================================
// WebNfcAdapter Implementation
// ============================================================================

/**
 * NFC adapter implementation using the Web NFC API (NDEFReader).
 *
 * This adapter wraps the browser's NDEFReader API and provides a consistent
 * interface for NFC operations. It handles:
 * - NFC availability detection
 * - Permission requests
 * - Scan operations with abort support
 * - Write operations with overwrite support
 * - Error handling with user-friendly messages
 *
 * @example
 * ```typescript
 * const adapter = new WebNfcAdapter();
 *
 * if (adapter.isSupported()) {
 *   adapter.onReading = (event) => {
 *     console.log('Tag scanned:', event.serialNumber);
 *     console.log('Records:', event.message.records);
 *   };
 *
 *   adapter.onError = (event) => {
 *     console.error('NFC error:', event.error.message);
 *   };
 *
 *   await adapter.scan();
 * }
 * ```
 */
export class WebNfcAdapter implements NfcAdapter {
  /** Callback invoked when an NFC tag is successfully read */
  onReading: ((event: NfcReadingEvent) => void) | null = null;

  /** Callback invoked when an NFC error occurs */
  onError: ((event: NfcErrorEvent) => void) | null = null;

  /** Current abort controller for cancelling operations */
  private abortController: AbortController | null = null;

  /** Current NDEFReader instance */
  private reader: WebNDEFReader | null = null;

  /** Bound event handlers for cleanup */
  private boundReadingHandler: ((event: WebNDEFReadingEvent) => void) | null = null;
  private boundErrorHandler: ((event: WebNDEFErrorEvent) => void) | null = null;

  /**
   * Check if NFC is available on this platform.
   *
   * Web NFC requires:
   * - Chrome browser on Android
   * - HTTPS connection (or localhost)
   * - NDEFReader API availability
   *
   * @returns true if NFC is supported and available
   */
  isSupported(): boolean {
    return getNDEFReaderConstructor() !== null;
  }

  /**
   * Get the capabilities of this adapter.
   *
   * Web NFC supports both reading and writing, with support for
   * common NDEF record types.
   *
   * @returns NfcCapabilities describing what operations are supported
   */
  getCapabilities(): NfcCapabilities {
    if (!this.isSupported()) {
      return {
        canRead: false,
        canWrite: false,
        supportedRecordTypes: [],
      };
    }

    return {
      canRead: true,
      canWrite: true,
      supportedRecordTypes: ["text", "url", "mime", "unknown", "empty"],
    };
  }

  /**
   * Start scanning for NFC tags.
   *
   * When a tag is detected, the onReading callback will be invoked with
   * the tag's serial number and NDEF message. If an error occurs, the
   * onError callback will be invoked.
   *
   * The scan operation continues until:
   * - abort() is called
   * - The provided AbortSignal is triggered
   * - An unrecoverable error occurs
   *
   * @param options - Optional scan configuration with AbortSignal
   * @throws Error if NFC is not supported or permission is denied
   */
  async scan(options?: NfcScanOptions): Promise<void> {
    const NDEFReaderCtor = getNDEFReaderConstructor();

    if (!NDEFReaderCtor) {
      const error = new Error("NFC tidak tersedia di perangkat ini.");
      error.name = "NotSupportedError";
      this.emitError(error);
      throw error;
    }

    // Clean up any existing scan
    this.cleanup();

    // Create new abort controller, linking to provided signal if any
    this.abortController = new AbortController();

    if (options?.signal) {
      // If external signal aborts, abort our controller too
      options.signal.addEventListener("abort", () => {
        this.abortController?.abort();
      });

      // If already aborted, abort immediately
      if (options.signal.aborted) {
        this.abortController.abort();
        const error = new Error("Operasi dibatalkan.");
        error.name = "AbortError";
        throw error;
      }
    }

    // Create NDEFReader instance
    this.reader = new NDEFReaderCtor();

    // Set up event handlers
    this.boundReadingHandler = (event: WebNDEFReadingEvent) => {
      this.handleReading(event);
    };

    this.boundErrorHandler = (event: WebNDEFErrorEvent) => {
      this.handleReadError(event);
    };

    this.reader.addEventListener("reading", this.boundReadingHandler);
    this.reader.addEventListener("readingerror", this.boundErrorHandler);

    try {
      // Start scanning - this will request permission if needed
      await this.reader.scan({ signal: this.abortController.signal });
    } catch (error) {
      this.cleanup();

      if (error instanceof DOMException) {
        const wrappedError = new Error(friendlyErrorMessage(error));
        wrappedError.name = error.name;
        this.emitError(wrappedError);
        throw wrappedError;
      }

      const wrappedError = error instanceof Error ? error : new Error(String(error));
      this.emitError(wrappedError);
      throw wrappedError;
    }
  }

  /**
   * Write data to an NFC tag.
   *
   * The write operation will wait for a tag to be in range, then write
   * the provided data as an NDEF "unknown" record. This is suitable for
   * binary data like encrypted card payloads.
   *
   * @param data - The raw bytes to write to the tag
   * @param options - Optional write configuration with AbortSignal and overwrite flag
   * @throws Error if write fails or is aborted
   */
  async write(data: Uint8Array, options?: NfcWriteOptions): Promise<void> {
    const NDEFReaderCtor = getNDEFReaderConstructor();

    if (!NDEFReaderCtor) {
      const error = new Error("NFC tidak tersedia di perangkat ini.");
      error.name = "NotSupportedError";
      this.emitError(error);
      throw error;
    }

    // Create abort controller for this operation
    const writeAbortController = new AbortController();

    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        writeAbortController.abort();
      });

      if (options.signal.aborted) {
        const error = new Error("Operasi dibatalkan.");
        error.name = "AbortError";
        throw error;
      }
    }

    try {
      const writer = new NDEFReaderCtor();

      // Prepare the NDEF message with an "unknown" record type for binary data
      const message: WebNDEFMessageInit = {
        records: [
          {
            recordType: "unknown",
            data: data.buffer.slice(
              data.byteOffset,
              data.byteOffset + data.byteLength,
            ) as ArrayBuffer,
          },
        ],
      };

      await writer.write(message, {
        signal: writeAbortController.signal,
        overwrite: options?.overwrite ?? false,
      });
    } catch (error) {
      if (error instanceof DOMException) {
        const wrappedError = new Error(friendlyErrorMessage(error));
        wrappedError.name = error.name;
        this.emitError(wrappedError);
        throw wrappedError;
      }

      const wrappedError = error instanceof Error ? error : new Error(String(error));
      this.emitError(wrappedError);
      throw wrappedError;
    }
  }

  /**
   * Abort any ongoing NFC operation (scan or write).
   *
   * This will cause the operation's promise to reject with an AbortError.
   * It also cleans up event listeners and releases the NDEFReader instance.
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.cleanup();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle a successful NFC reading event.
   */
  private handleReading(event: WebNDEFReadingEvent): void {
    if (!this.onReading) return;

    const nfcEvent: NfcReadingEvent = {
      serialNumber: event.serialNumber,
      message: convertMessage(event.message),
    };

    this.onReading(nfcEvent);
  }

  /**
   * Handle an NFC reading error event.
   */
  private handleReadError(event: WebNDEFErrorEvent): void {
    const error = new Error(friendlyErrorMessage(event.error));
    error.name = event.error.name;
    this.emitError(error);
  }

  /**
   * Emit an error through the onError callback.
   */
  private emitError(error: Error): void {
    if (this.onError) {
      this.onError({ error });
    }
  }

  /**
   * Clean up resources and event listeners.
   */
  private cleanup(): void {
    if (this.reader && this.boundReadingHandler && this.boundErrorHandler) {
      this.reader.removeEventListener("reading", this.boundReadingHandler);
      this.reader.removeEventListener("readingerror", this.boundErrorHandler);
    }

    this.reader = null;
    this.boundReadingHandler = null;
    this.boundErrorHandler = null;
    this.abortController = null;
  }
}
