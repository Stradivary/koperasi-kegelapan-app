/**
 * Mock NFC Adapter for Testing
 *
 * This module provides a mock implementation of the NfcAdapter interface
 * for unit testing purposes. It allows configuring responses, simulating
 * errors, and tracking method calls.
 *
 * @module core/nfc/adapters/mockNfcAdapter
 */

import type {
  NfcAdapter,
  NfcCapabilities,
  NfcErrorCode,
  NfcErrorEvent,
  NfcReadingEvent,
  NfcScanOptions,
  NfcWriteOptions,
} from "./types";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for a mock scan response.
 */
export interface MockScanResponse {
  /** The serial number to return */
  serialNumber: string;
  /** The raw data bytes to return */
  data: Uint8Array | null;
  /** The record type for the NDEF record */
  recordType?: string;
  /** Optional delay in milliseconds before responding */
  delay?: number;
}

/**
 * Configuration for a mock error response.
 */
export interface MockErrorResponse {
  /** The error code to simulate */
  code: NfcErrorCode;
  /** The error message */
  message: string;
  /** Optional delay in milliseconds before triggering error */
  delay?: number;
}

/**
 * Configuration for a mock write response.
 */
export interface MockWriteResponse {
  /** Whether the write should succeed */
  success: boolean;
  /** Error to return if success is false */
  error?: MockErrorResponse;
  /** Optional delay in milliseconds before responding */
  delay?: number;
}

/**
 * Configuration options for MockNfcAdapter.
 */
export interface MockNfcAdapterConfig {
  /** Whether NFC is supported (default: true) */
  isSupported?: boolean;
  /** Adapter capabilities */
  capabilities?: Partial<NfcCapabilities>;
  /** Default delay for all operations in milliseconds */
  defaultDelay?: number;
  /** Queue of scan responses to return in order */
  scanResponses?: Array<MockScanResponse | MockErrorResponse>;
  /** Queue of write responses to return in order */
  writeResponses?: Array<MockWriteResponse>;
}

/**
 * Record of a method call for test assertions.
 */
export interface MethodCall {
  /** The method that was called */
  method: "scan" | "write" | "abort" | "isSupported" | "getCapabilities";
  /** Timestamp when the method was called */
  timestamp: number;
  /** Arguments passed to the method */
  args?: unknown[];
}

// ============================================================================
// Mock NFC Adapter Implementation
// ============================================================================

/**
 * Mock implementation of NfcAdapter for testing.
 *
 * This adapter allows you to:
 * - Configure whether NFC is supported
 * - Queue scan responses (success or error)
 * - Queue write responses (success or error)
 * - Simulate delays to test timing behavior
 * - Track all method calls for assertions
 * - Manually trigger scan events
 *
 * @example
 * ```typescript
 * const mockAdapter = new MockNfcAdapter({
 *   scanResponses: [
 *     { serialNumber: "04:A1:B2:C3:D4:E5:F6", data: new Uint8Array([1, 2, 3]) },
 *     { code: "SCAN_FAILED", message: "Tag lost" },
 *   ],
 * });
 *
 * mockAdapter.onReading = (event) => console.log("Read:", event.serialNumber);
 * mockAdapter.onError = (event) => console.log("Error:", event.error.message);
 *
 * await mockAdapter.scan(); // Returns first response
 * await mockAdapter.scan(); // Returns error
 * ```
 */
export class MockNfcAdapter implements NfcAdapter {
  // ─── Configuration ─────────────────────────────────────────────────────────
  private _isSupported: boolean;
  private _capabilities: NfcCapabilities;
  private _defaultDelay: number;
  private _scanResponses: Array<MockScanResponse | MockErrorResponse>;
  private _writeResponses: Array<MockWriteResponse>;

  // ─── State ─────────────────────────────────────────────────────────────────
  private _scanResponseIndex = 0;
  private _writeResponseIndex = 0;
  private _currentAbortController: AbortController | null = null;
  private _isScanning = false;
  private _methodCalls: MethodCall[] = [];

  // ─── Event Handlers ────────────────────────────────────────────────────────
  onReading: ((event: NfcReadingEvent) => void) | null = null;
  onError: ((event: NfcErrorEvent) => void) | null = null;

  constructor(config: MockNfcAdapterConfig = {}) {
    this._isSupported = config.isSupported ?? true;
    this._capabilities = {
      canRead: config.capabilities?.canRead ?? true,
      canWrite: config.capabilities?.canWrite ?? true,
      supportedRecordTypes: config.capabilities?.supportedRecordTypes ?? [
        "text",
        "url",
        "mime",
        "unknown",
      ],
    };
    this._defaultDelay = config.defaultDelay ?? 0;
    this._scanResponses = config.scanResponses ?? [];
    this._writeResponses = config.writeResponses ?? [];
  }

  // ─── NfcAdapter Interface Implementation ───────────────────────────────────

  /**
   * Check if NFC is supported (configurable via constructor).
   */
  isSupported(): boolean {
    this._recordCall("isSupported");
    return this._isSupported;
  }

  /**
   * Get the configured capabilities.
   */
  getCapabilities(): NfcCapabilities {
    this._recordCall("getCapabilities");
    return { ...this._capabilities };
  }

  /**
   * Start a mock scan operation.
   *
   * If scan responses are configured, returns the next response in the queue.
   * Otherwise, waits indefinitely until abort() is called or simulateScan() is used.
   */
  async scan(options?: NfcScanOptions): Promise<void> {
    this._recordCall("scan", [options]);

    if (!this._isSupported) {
      const error = new Error("NFC not supported");
      error.name = "NotSupportedError";
      this.onError?.({ error });
      throw error;
    }

    if (this._isScanning) {
      const error = new Error("Scan already in progress");
      this.onError?.({ error });
      throw error;
    }

    this._isScanning = true;
    this._currentAbortController = new AbortController();

    // Link external signal to internal abort controller
    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        this._currentAbortController?.abort();
      });
    }

    try {
      // If we have queued responses, use the next one
      if (this._scanResponseIndex < this._scanResponses.length) {
        const response = this._scanResponses[this._scanResponseIndex++];
        await this._processResponse(response);
      } else {
        // Wait indefinitely until aborted or simulateScan is called
        await this._waitForAbortOrManualTrigger();
      }
    } finally {
      this._isScanning = false;
      this._currentAbortController = null;
    }
  }

  /**
   * Perform a mock write operation.
   *
   * If write responses are configured, returns the next response in the queue.
   * Otherwise, succeeds immediately.
   */
  async write(data: Uint8Array, options?: NfcWriteOptions): Promise<void> {
    this._recordCall("write", [data, options]);

    if (!this._isSupported) {
      throw new Error("NFC not supported");
    }

    if (!this._capabilities.canWrite) {
      throw new Error("Write not supported");
    }

    // Get the next write response or default to success
    const response: MockWriteResponse =
      this._writeResponseIndex < this._writeResponses.length
        ? this._writeResponses[this._writeResponseIndex++]
        : { success: true };

    const delay = response.delay ?? this._defaultDelay;
    if (delay > 0) {
      await this._delay(delay, options?.signal);
    }

    if (!response.success && response.error) {
      const error = new Error(response.error.message);
      error.name = response.error.code;
      throw error;
    }
  }

  /**
   * Abort any ongoing operation.
   */
  abort(): void {
    this._recordCall("abort");
    this._currentAbortController?.abort();
    this._isScanning = false;
  }

  // ─── Test Helper Methods ───────────────────────────────────────────────────

  /**
   * Manually trigger a scan event (useful when no responses are queued).
   */
  simulateScan(response: MockScanResponse): void {
    if (!this._isScanning) {
      throw new Error("Cannot simulate scan when not scanning");
    }

    const event: NfcReadingEvent = {
      serialNumber: response.serialNumber,
      message: {
        records: [
          {
            recordType: response.recordType ?? "unknown",
            data: response.data,
          },
        ],
      },
    };

    this.onReading?.(event);
  }

  /**
   * Manually trigger an error event.
   */
  simulateError(error: MockErrorResponse): void {
    const err = new Error(error.message);
    err.name = error.code;
    this.onError?.({ error: err });
  }

  /**
   * Get all recorded method calls.
   */
  getCalls(): MethodCall[] {
    return [...this._methodCalls];
  }

  /**
   * Get calls for a specific method.
   */
  getCallsFor(method: MethodCall["method"]): MethodCall[] {
    return this._methodCalls.filter((call) => call.method === method);
  }

  /**
   * Check if a method was called.
   */
  wasCalled(method: MethodCall["method"]): boolean {
    return this._methodCalls.some((call) => call.method === method);
  }

  /**
   * Get the number of times a method was called.
   */
  callCount(method: MethodCall["method"]): number {
    return this._methodCalls.filter((call) => call.method === method).length;
  }

  /**
   * Reset all state (responses, call history, etc.).
   */
  reset(): void {
    this._scanResponseIndex = 0;
    this._writeResponseIndex = 0;
    this._methodCalls = [];
    this._isScanning = false;
    this._currentAbortController = null;
  }

  /**
   * Reset only the call history.
   */
  resetCalls(): void {
    this._methodCalls = [];
  }

  /**
   * Add scan responses to the queue.
   */
  queueScanResponse(...responses: Array<MockScanResponse | MockErrorResponse>): void {
    this._scanResponses.push(...responses);
  }

  /**
   * Add write responses to the queue.
   */
  queueWriteResponse(...responses: MockWriteResponse[]): void {
    this._writeResponses.push(...responses);
  }

  /**
   * Set whether NFC is supported.
   */
  setSupported(supported: boolean): void {
    this._isSupported = supported;
  }

  /**
   * Set adapter capabilities.
   */
  setCapabilities(capabilities: Partial<NfcCapabilities>): void {
    this._capabilities = {
      ...this._capabilities,
      ...capabilities,
    };
  }

  /**
   * Check if currently scanning.
   */
  get isCurrentlyScanning(): boolean {
    return this._isScanning;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private _recordCall(method: MethodCall["method"], args?: unknown[]): void {
    this._methodCalls.push({
      method,
      timestamp: Date.now(),
      args,
    });
  }

  private async _processResponse(response: MockScanResponse | MockErrorResponse): Promise<void> {
    const delay = response.delay ?? this._defaultDelay;
    if (delay > 0) {
      await this._delay(delay, this._currentAbortController?.signal);
    }

    // Check if this is an error response
    if ("code" in response) {
      const error = new Error(response.message);
      error.name = response.code;
      this.onError?.({ error });
      return;
    }

    // It's a success response
    const event: NfcReadingEvent = {
      serialNumber: response.serialNumber,
      message: {
        records: [
          {
            recordType: response.recordType ?? "unknown",
            data: response.data,
          },
        ],
      },
    };

    this.onReading?.(event);
  }

  private async _waitForAbortOrManualTrigger(): Promise<void> {
    return new Promise((_, reject) => {
      const checkAbort = () => {
        if (this._currentAbortController?.signal.aborted) {
          const error = new Error("Operation aborted");
          error.name = "AbortError";
          reject(error);
        }
      };

      // Check immediately
      checkAbort();

      // Set up abort listener
      this._currentAbortController?.signal.addEventListener("abort", () => {
        const error = new Error("Operation aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }

  private async _delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);

      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          const error = new Error("Operation aborted");
          error.name = "AbortError";
          reject(error);
        });
      }
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a MockNfcAdapter with common test configurations.
 */
export function createMockAdapter(config?: MockNfcAdapterConfig): MockNfcAdapter {
  return new MockNfcAdapter(config);
}

/**
 * Create a MockNfcAdapter that simulates NFC not being supported.
 */
export function createUnsupportedAdapter(): MockNfcAdapter {
  return new MockNfcAdapter({ isSupported: false });
}

/**
 * Create a MockNfcAdapter with a single successful scan response.
 */
export function createSuccessAdapter(
  serialNumber: string,
  data: Uint8Array | null,
  delay?: number,
): MockNfcAdapter {
  return new MockNfcAdapter({
    scanResponses: [{ serialNumber, data, delay }],
  });
}

/**
 * Create a MockNfcAdapter that always returns an error.
 */
export function createErrorAdapter(
  code: NfcErrorCode,
  message: string,
  delay?: number,
): MockNfcAdapter {
  return new MockNfcAdapter({
    scanResponses: [{ code, message, delay }],
  });
}

/**
 * Create a MockNfcAdapter with read-only capabilities.
 */
export function createReadOnlyAdapter(): MockNfcAdapter {
  return new MockNfcAdapter({
    capabilities: { canRead: true, canWrite: false },
  });
}
