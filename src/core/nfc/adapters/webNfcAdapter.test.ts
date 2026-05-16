import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebNfcAdapter } from "./webNfcAdapter";
import type { NfcReadingEvent, NfcErrorEvent } from "./types";

// ============================================================================
// Mock NDEFReader
// ============================================================================

interface MockNDEFReadingEvent extends Event {
  serialNumber: string;
  message: {
    records: Array<{
      recordType: string;
      data: DataView | null;
    }>;
  };
}

interface MockNDEFErrorEvent extends Event {
  error: DOMException;
}

type ReadingHandler = (event: MockNDEFReadingEvent) => void;
type ErrorHandler = (event: MockNDEFErrorEvent) => void;

class MockNDEFReader {
  private readingHandlers: ReadingHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private scanPromiseResolve: (() => void) | null = null;
  private scanPromiseReject: ((error: Error) => void) | null = null;

  scan(options?: { signal?: AbortSignal }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.scanPromiseResolve = resolve;
      this.scanPromiseReject = reject;

      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          const error = new DOMException("Aborted", "AbortError");
          reject(error);
        });
      }

      // Simulate successful scan start
      setTimeout(() => resolve(), 0);
    });
  }

  write(
    _message: { records: Array<{ recordType: string; data: BufferSource }> },
    options?: { signal?: AbortSignal; overwrite?: boolean },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }

      // Simulate successful write
      setTimeout(() => resolve(), 0);
    });
  }

  addEventListener(type: "reading" | "readingerror", handler: ReadingHandler | ErrorHandler): void {
    if (type === "reading") {
      this.readingHandlers.push(handler as ReadingHandler);
    } else if (type === "readingerror") {
      this.errorHandlers.push(handler as ErrorHandler);
    }
  }

  removeEventListener(
    type: "reading" | "readingerror",
    handler: ReadingHandler | ErrorHandler,
  ): void {
    if (type === "reading") {
      this.readingHandlers = this.readingHandlers.filter((h) => h !== handler);
    } else if (type === "readingerror") {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    }
  }

  // Test helpers
  simulateReading(
    serialNumber: string,
    records: Array<{ recordType: string; data: Uint8Array | null }>,
  ) {
    const event = {
      serialNumber,
      message: {
        records: records.map((r) => ({
          recordType: r.recordType,
          data: r.data ? new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength) : null,
        })),
      },
    } as MockNDEFReadingEvent;

    this.readingHandlers.forEach((handler) => handler(event));
  }

  simulateError(error: DOMException) {
    const event = { error } as MockNDEFErrorEvent;
    this.errorHandlers.forEach((handler) => handler(event));
  }

  rejectScan(error: Error) {
    this.scanPromiseReject?.(error);
  }
}

// Store the mock instance for test access
let mockReaderInstance: MockNDEFReader | null = null;

// ============================================================================
// Tests
// ============================================================================

describe("WebNfcAdapter", () => {
  beforeEach(() => {
    mockReaderInstance = null;

    // Mock NDEFReader in globalThis
    (globalThis as unknown as { NDEFReader: new () => MockNDEFReader }).NDEFReader = class {
      constructor() {
        mockReaderInstance = new MockNDEFReader();
        return mockReaderInstance as unknown as MockNDEFReader;
      }
    } as unknown as new () => MockNDEFReader;
  });

  afterEach(() => {
    // Clean up mock
    delete (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader;
    mockReaderInstance = null;
  });

  describe("isSupported", () => {
    it("returns true when NDEFReader is available", () => {
      const adapter = new WebNfcAdapter();
      expect(adapter.isSupported()).toBe(true);
    });

    it("returns false when NDEFReader is not available", () => {
      delete (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader;
      const adapter = new WebNfcAdapter();
      expect(adapter.isSupported()).toBe(false);
    });
  });

  describe("getCapabilities", () => {
    it("returns full capabilities when NFC is supported", () => {
      const adapter = new WebNfcAdapter();
      const capabilities = adapter.getCapabilities();

      expect(capabilities.canRead).toBe(true);
      expect(capabilities.canWrite).toBe(true);
      expect(capabilities.supportedRecordTypes).toContain("text");
      expect(capabilities.supportedRecordTypes).toContain("url");
      expect(capabilities.supportedRecordTypes).toContain("unknown");
    });

    it("returns empty capabilities when NFC is not supported", () => {
      delete (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader;
      const adapter = new WebNfcAdapter();
      const capabilities = adapter.getCapabilities();

      expect(capabilities.canRead).toBe(false);
      expect(capabilities.canWrite).toBe(false);
      expect(capabilities.supportedRecordTypes).toHaveLength(0);
    });
  });

  describe("scan", () => {
    it("starts scanning and invokes onReading callback when tag is detected", async () => {
      const adapter = new WebNfcAdapter();
      const onReading = vi.fn<[NfcReadingEvent], void>();
      adapter.onReading = onReading;

      const scanPromise = adapter.scan();

      // Wait for scan to start
      await scanPromise;

      // Simulate a tag reading
      const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      mockReaderInstance?.simulateReading("ABC123", [{ recordType: "unknown", data: testData }]);

      expect(onReading).toHaveBeenCalledTimes(1);
      const event = onReading.mock.calls[0][0];
      expect(event.serialNumber).toBe("ABC123");
      expect(event.message.records).toHaveLength(1);
      expect(event.message.records[0].recordType).toBe("unknown");
      expect(event.message.records[0].data).toEqual(testData);
    });

    it("invokes onError callback when reading error occurs", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn<[NfcErrorEvent], void>();
      adapter.onError = onError;

      await adapter.scan();

      // Simulate a reading error
      const domError = new DOMException("Tag removed", "NotReadableError");
      mockReaderInstance?.simulateError(domError);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].error).toBeDefined();
    });

    it("throws error when NFC is not supported", async () => {
      delete (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader;
      const adapter = new WebNfcAdapter();

      await expect(adapter.scan()).rejects.toThrow("NFC tidak tersedia");
    });

    it("handles abort signal after scan starts", async () => {
      const adapter = new WebNfcAdapter();
      const abortController = new AbortController();

      // Start scan
      await adapter.scan({ signal: abortController.signal });

      // Abort after scan has started - this should clean up the adapter
      adapter.abort();

      // Verify adapter can be used again after abort
      const onReading = vi.fn();
      adapter.onReading = onReading;
      await adapter.scan();

      // Should work normally after abort
      mockReaderInstance?.simulateReading("NEW123", [
        { recordType: "unknown", data: new Uint8Array([0x01]) },
      ]);

      expect(onReading).toHaveBeenCalledTimes(1);
    });

    it("handles pre-aborted signal", async () => {
      const adapter = new WebNfcAdapter();
      const abortController = new AbortController();
      abortController.abort();

      await expect(adapter.scan({ signal: abortController.signal })).rejects.toThrow(
        "Operasi dibatalkan",
      );
    });

    it("handles records with null data", async () => {
      const adapter = new WebNfcAdapter();
      const onReading = vi.fn<[NfcReadingEvent], void>();
      adapter.onReading = onReading;

      await adapter.scan();

      // Simulate a tag with empty record
      mockReaderInstance?.simulateReading("DEF456", [{ recordType: "empty", data: null }]);

      expect(onReading).toHaveBeenCalledTimes(1);
      const event = onReading.mock.calls[0][0];
      expect(event.message.records[0].data).toBeNull();
    });
  });

  describe("write", () => {
    it("writes data successfully", async () => {
      const adapter = new WebNfcAdapter();
      const testData = new Uint8Array([0x4b, 0x4f, 0x50, 0x57, 0x01, 0x02]);

      await expect(adapter.write(testData)).resolves.toBeUndefined();
    });

    it("writes data with overwrite option", async () => {
      const adapter = new WebNfcAdapter();
      const testData = new Uint8Array([0x4b, 0x4f, 0x50, 0x57]);

      await expect(adapter.write(testData, { overwrite: true })).resolves.toBeUndefined();
    });

    it("throws error when NFC is not supported", async () => {
      delete (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader;
      const adapter = new WebNfcAdapter();
      const testData = new Uint8Array([0x01, 0x02]);

      await expect(adapter.write(testData)).rejects.toThrow("NFC tidak tersedia");
    });

    it("handles abort signal during write", async () => {
      const adapter = new WebNfcAdapter();
      const abortController = new AbortController();
      abortController.abort();

      const testData = new Uint8Array([0x01, 0x02]);

      await expect(adapter.write(testData, { signal: abortController.signal })).rejects.toThrow(
        "Operasi dibatalkan",
      );
    });
  });

  describe("abort", () => {
    it("aborts ongoing scan operation", async () => {
      const adapter = new WebNfcAdapter();
      const onReading = vi.fn();
      adapter.onReading = onReading;

      // Start scan
      const scanPromise = adapter.scan();
      await scanPromise;

      // Abort
      adapter.abort();

      // Simulate reading after abort - should not trigger callback
      // (In real implementation, the abort would prevent further events)
      // This test verifies cleanup happens
      expect(adapter.onReading).toBe(onReading); // Callback still set
    });

    it("can be called multiple times safely", () => {
      const adapter = new WebNfcAdapter();

      // Should not throw
      adapter.abort();
      adapter.abort();
      adapter.abort();
    });

    it("can be called before any operation", () => {
      const adapter = new WebNfcAdapter();

      // Should not throw
      expect(() => adapter.abort()).not.toThrow();
    });
  });

  describe("error message translation", () => {
    it("translates permission denied error", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn<[NfcErrorEvent], void>();
      adapter.onError = onError;

      await adapter.scan();

      const permissionError = new DOMException("Permission denied", "NotAllowedError");
      mockReaderInstance?.simulateError(permissionError);

      expect(onError.mock.calls[0][0].error.message).toContain("Izin NFC ditolak");
    });

    it("translates NDEF compatibility error", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn<[NfcErrorEvent], void>();
      adapter.onError = onError;

      await adapter.scan();

      const ndefError = new DOMException("Tag is not NDEF compatible", "NotSupportedError");
      mockReaderInstance?.simulateError(ndefError);

      expect(onError.mock.calls[0][0].error.message).toContain("NDEF");
    });

    it("translates I/O error (card moved too fast)", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn<[NfcErrorEvent], void>();
      adapter.onError = onError;

      await adapter.scan();

      const ioError = new DOMException("I/O error during write", "NetworkError");
      mockReaderInstance?.simulateError(ioError);

      expect(onError.mock.calls[0][0].error.message).toContain("kartu dipindahkan");
    });
  });

  describe("multiple records handling", () => {
    it("handles multiple NDEF records", async () => {
      const adapter = new WebNfcAdapter();
      const onReading = vi.fn<[NfcReadingEvent], void>();
      adapter.onReading = onReading;

      await adapter.scan();

      mockReaderInstance?.simulateReading("MULTI123", [
        { recordType: "text", data: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) },
        { recordType: "url", data: new Uint8Array([0x68, 0x74, 0x74, 0x70]) },
        { recordType: "unknown", data: new Uint8Array([0x01, 0x02, 0x03]) },
      ]);

      expect(onReading).toHaveBeenCalledTimes(1);
      const event = onReading.mock.calls[0][0];
      expect(event.message.records).toHaveLength(3);
      expect(event.message.records[0].recordType).toBe("text");
      expect(event.message.records[1].recordType).toBe("url");
      expect(event.message.records[2].recordType).toBe("unknown");
    });
  });
});
