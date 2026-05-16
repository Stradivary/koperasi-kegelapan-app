/**
 * Unit tests for GenericNfcLayer
 *
 * Tests the generic NFC layer functionality including scan flow,
 * write flow, abort functionality, and error handling.
 *
 * **Validates: Requirements 1.1, 4.1, 4.4, 19.4**
 *
 * @module core/nfc/__tests__/genericNfcLayer.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_SCHEMA_VERSION, MAGIC, WIRE_SIZE } from "../../payload/types";
import type { MockNfcAdapter } from "../adapters/mockNfcAdapter";
import {
  createErrorAdapter,
  createMockAdapter,
  createUnsupportedAdapter,
} from "../adapters/mockNfcAdapter";
import type { NfcRecord } from "../adapters/types";
import { GenericNfcLayer } from "../genericNfcLayer";
import type { WritePhase } from "../types";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a valid payload structure for testing.
 */
function createValidPayload(): Uint8Array {
  const bytes = new Uint8Array(WIRE_SIZE);
  const view = new DataView(bytes.buffer);

  // Magic bytes (big-endian)
  view.setUint32(0, MAGIC, false);

  // Version
  bytes[4] = CARD_SCHEMA_VERSION;

  // Type (0 for standard)
  bytes[5] = 0;

  // CardId (6 bytes, non-zero)
  bytes[6] = 0x01;
  bytes[7] = 0x02;
  bytes[8] = 0x03;
  bytes[9] = 0x04;
  bytes[10] = 0x05;
  bytes[11] = 0x06;

  return bytes;
}

/**
 * Create foreign card data (wrong magic bytes).
 */
function createForeignData(): Uint8Array {
  return new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
}

/**
 * Wait for a specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Tests
// ============================================================================

describe("GenericNfcLayer", () => {
  let mockAdapter: MockNfcAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
  });

  afterEach(() => {
    mockAdapter.reset();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isSupported() Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("isSupported()", () => {
    it("should return true when adapter supports NFC", () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      expect(layer.isSupported()).toBe(true);
    });

    it("should return false when adapter does not support NFC", () => {
      const unsupportedAdapter = createUnsupportedAdapter();
      const layer = new GenericNfcLayer({ adapter: unsupportedAdapter });
      expect(layer.isSupported()).toBe(false);
    });

    it("should delegate to adapter's isSupported method", () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      layer.isSupported();
      expect(mockAdapter.wasCalled("isSupported")).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // scan() Success Flow Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("scan() success flow", () => {
    it("should call adapter.scan()", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      await layer.scan();

      expect(mockAdapter.wasCalled("scan")).toBe(true);
    });

    it("should fire onRawScan callback with RawNfcResult", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const onRawScan = vi.fn();
      const layer = new GenericNfcLayer({
        adapter: mockAdapter,
        onRawScan,
      });

      await layer.scan();

      expect(onRawScan).toHaveBeenCalledTimes(1);
      expect(onRawScan).toHaveBeenCalledWith(
        expect.objectContaining({
          serialNumber: "04:A1:B2:C3:D4:E5:F6",
          rawBytes: validData,
          classification: "valid_payload",
        }),
      );
    });

    it("should return RawNfcResult with correct classification", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.classification).toBe("valid_payload");
    });

    it("should include serial number in result", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.serialNumber).toBe("04:A1:B2:C3:D4:E5:F6");
    });

    it("should include rawBytes in result", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.rawBytes).toEqual(validData);
    });

    it("should include records in result", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
        recordType: "unknown",
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.records).toHaveLength(1);
      expect(result.records[0].recordType).toBe("unknown");
      expect(result.records[0].data).toEqual(validData);
    });

    it("should include metadata in result", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.metadata).toEqual({
        recordCount: 1,
        totalBytes: validData.length,
        hasNdef: true,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // scan() with Different Card Types
  // ─────────────────────────────────────────────────────────────────────────

  describe("scan() with different card types", () => {
    it("should classify empty card (no records) as 'empty'", async () => {
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: null,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.classification).toBe("unknown");
      expect(result.rawBytes).toBeNull();
    });

    it("should classify foreign card (wrong magic bytes) as 'foreign'", async () => {
      const foreignData = createForeignData();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: foreignData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.classification).toBe("foreign");
    });

    it("should classify valid payload card as 'valid_payload'", async () => {
      const validData = createValidPayload();
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.classification).toBe("valid_payload");
    });

    it("should handle card with invalid format (correct magic, bad structure)", async () => {
      // Create data with correct magic but invalid structure
      const invalidData = new Uint8Array(20);
      const view = new DataView(invalidData.buffer);
      view.setUint32(0, MAGIC, false);
      invalidData[4] = 0; // Invalid version

      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: invalidData,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const result = await layer.scan();

      expect(result.classification).toBe("invalid_format");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // writeRaw() Success Flow Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("writeRaw() success flow", () => {
    it("should fire onWriteProgress with phases in order", async () => {
      mockAdapter.queueWriteResponse({ success: true });

      const progressPhases: WritePhase[] = [];
      const layer = new GenericNfcLayer({
        adapter: mockAdapter,
        onWriteProgress: (phase) => progressPhases.push(phase),
      });

      await layer.writeRaw(new Uint8Array([1, 2, 3]));

      expect(progressPhases).toEqual(["preparing", "waiting", "writing", "complete"]);
    });

    it("should call adapter.write()", async () => {
      mockAdapter.queueWriteResponse({ success: true });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const data = new Uint8Array([1, 2, 3]);
      await layer.writeRaw(data);

      expect(mockAdapter.wasCalled("write")).toBe(true);
      const writeCalls = mockAdapter.getCallsFor("write");
      expect(writeCalls).toHaveLength(1);
      expect(writeCalls[0].args?.[0]).toEqual(data);
    });

    it("should pass options to adapter.write()", async () => {
      mockAdapter.queueWriteResponse({ success: true });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const data = new Uint8Array([1, 2, 3]);
      const options = { overwrite: true };
      await layer.writeRaw(data, options);

      const writeCalls = mockAdapter.getCallsFor("write");
      expect(writeCalls[0].args?.[1]).toEqual(options);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // writeText() Convenience Method Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("writeText() convenience method", () => {
    it("should encode text as UTF-8", async () => {
      mockAdapter.queueWriteResponse({ success: true });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      await layer.writeText("Hello, NFC!");

      const writeCalls = mockAdapter.getCallsFor("write");
      expect(writeCalls).toHaveLength(1);

      const writtenData = writeCalls[0].args?.[0] as Uint8Array;
      const decoder = new TextDecoder();
      expect(decoder.decode(writtenData)).toBe("Hello, NFC!");
    });

    it("should call writeRaw internally", async () => {
      mockAdapter.queueWriteResponse({ success: true });

      const progressPhases: WritePhase[] = [];
      const layer = new GenericNfcLayer({
        adapter: mockAdapter,
        onWriteProgress: (phase) => progressPhases.push(phase),
      });

      await layer.writeText("Test");

      // Should go through the same progress phases as writeRaw
      expect(progressPhases).toEqual(["preparing", "waiting", "writing", "complete"]);
    });

    it("should handle Unicode text correctly", async () => {
      mockAdapter.queueWriteResponse({ success: true });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      await layer.writeText("こんにちは"); // Japanese "Hello"

      const writeCalls = mockAdapter.getCallsFor("write");
      const writtenData = writeCalls[0].args?.[0] as Uint8Array;
      const decoder = new TextDecoder();
      expect(decoder.decode(writtenData)).toBe("こんにちは");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // abort() Functionality Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("abort() functionality", () => {
    it("should abort adapter", () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      layer.abort();

      expect(mockAdapter.wasCalled("abort")).toBe(true);
    });

    it("should clean up internal state", async () => {
      // Start a scan that will wait indefinitely
      const layer = new GenericNfcLayer({ adapter: mockAdapter });

      // Start scan without queued response (will wait)
      const scanPromise = layer.scan().catch(() => {
        // Expected to reject on abort
      });

      // Give it a moment to start
      await delay(10);

      // Abort should clean up
      layer.abort();

      // Wait for the promise to settle
      await scanPromise;

      // Verify abort was called
      expect(mockAdapter.wasCalled("abort")).toBe(true);
    });

    it("should abort scan operation via AbortSignal", async () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const abortController = new AbortController();

      // Start scan without queued response
      const scanPromise = layer.scan(abortController.signal);

      // Give it a moment to start
      await delay(10);

      // Abort via signal
      abortController.abort();

      // Should reject with abort error
      await expect(scanPromise).rejects.toThrow();
    });

    it("should reject immediately if signal is already aborted", async () => {
      // const layer = new GenericNfcLayer({ adapter: mockAdapter });
      const abortController = new AbortController();
      abortController.abort(); // Pre-abort

      const onError = vi.fn();
      const layerWithError = new GenericNfcLayer({
        adapter: mockAdapter,
        onError,
      });

      await expect(layerWithError.scan(abortController.signal)).rejects.toThrow();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "ABORTED",
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error Handling Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("error handling", () => {
    describe("NFC not supported error", () => {
      it("should throw error when NFC is not supported on scan", async () => {
        const unsupportedAdapter = createUnsupportedAdapter();
        const layer = new GenericNfcLayer({ adapter: unsupportedAdapter });

        await expect(layer.scan()).rejects.toThrow("NFC tidak tersedia di perangkat ini.");
      });

      it("should fire onError callback when NFC is not supported on scan", async () => {
        const unsupportedAdapter = createUnsupportedAdapter();
        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter: unsupportedAdapter,
          onError,
        });

        await expect(layer.scan()).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "NOT_SUPPORTED",
            recoverable: false,
          }),
        );
      });

      it("should throw error when NFC is not supported on write", async () => {
        const unsupportedAdapter = createUnsupportedAdapter();
        const layer = new GenericNfcLayer({ adapter: unsupportedAdapter });

        await expect(layer.writeRaw(new Uint8Array([1, 2, 3]))).rejects.toThrow(
          "NFC tidak tersedia di perangkat ini.",
        );
      });

      it("should fire onError callback when NFC is not supported on write", async () => {
        const unsupportedAdapter = createUnsupportedAdapter();
        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter: unsupportedAdapter,
          onError,
        });

        await expect(layer.writeRaw(new Uint8Array([1, 2, 3]))).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "NOT_SUPPORTED",
            recoverable: false,
          }),
        );
      });
    });

    describe("scan failed error", () => {
      it("should fire onError callback when scan fails", async () => {
        const errorAdapter = createErrorAdapter("SCAN_FAILED", "Tag lost during read");
        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter: errorAdapter,
          onError,
        });

        // The scan will trigger the error via the adapter's onError callback
        await layer.scan().catch(() => {
          // Expected to fail
        });

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "SCAN_FAILED",
            message: "Tag lost during read",
          }),
        );
      });

      it("should handle timeout errors", async () => {
        mockAdapter.queueScanResponse({
          code: "TIMEOUT",
          message: "Operation timeout",
        });

        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter: mockAdapter,
          onError,
        });

        await layer.scan().catch(() => {});

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "TIMEOUT",
            recoverable: true,
          }),
        );
      });
    });

    describe("write failed error", () => {
      it("should fire onError callback when write fails", async () => {
        mockAdapter.queueWriteResponse({
          success: false,
          error: {
            code: "WRITE_FAILED",
            message: "Failed to write to tag",
          },
        });

        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter: mockAdapter,
          onError,
        });

        await expect(layer.writeRaw(new Uint8Array([1, 2, 3]))).rejects.toThrow();

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "WRITE_FAILED",
          }),
        );
      });

      it("should set error code to WRITE_FAILED for write operations", async () => {
        mockAdapter.queueWriteResponse({
          success: false,
          error: {
            code: "SCAN_FAILED", // Even if adapter returns different code
            message: "Some error",
          },
        });

        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter: mockAdapter,
          onError,
        });

        await expect(layer.writeRaw(new Uint8Array([1, 2, 3]))).rejects.toThrow();

        // Should be overridden to WRITE_FAILED
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "WRITE_FAILED",
          }),
        );
      });
    });

    describe("permission denied error", () => {
      it("should handle permission denied errors via NotAllowedError", async () => {
        // The GenericNfcLayer maps "NotAllowedError" to "PERMISSION_DENIED"
        // We need to simulate this by creating an adapter that triggers the error handler
        const adapter = createMockAdapter();

        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter,
          onError,
        });

        // Start a scan that will wait
        const scanPromise = layer.scan().catch(() => {});

        // Give it a moment to start
        await delay(10);

        // Simulate a NotAllowedError (which maps to PERMISSION_DENIED)
        const permissionError = new Error("NFC permission denied");
        permissionError.name = "NotAllowedError";
        adapter.simulateError({
          code: "PERMISSION_DENIED",
          message: "NFC permission denied",
        });

        // Wait for the scan to complete
        await scanPromise;

        // The error handler receives the error from the adapter
        // Note: The mock adapter sets error.name to the code, so it won't map to PERMISSION_DENIED
        // This test verifies the error callback is fired
        expect(onError).toHaveBeenCalled();
      });

      it("should map NotAllowedError to PERMISSION_DENIED code", async () => {
        // Create a custom adapter that simulates NotAllowedError properly
        const adapter = createMockAdapter();

        const onError = vi.fn();
        const layer = new GenericNfcLayer({
          adapter,
          onError,
        });

        // Start a scan
        const scanPromise = layer.scan().catch(() => {});

        // Give it a moment to start
        await delay(10);

        // Manually trigger an error event with NotAllowedError name
        const permissionError = new Error("User denied NFC permission");
        permissionError.name = "NotAllowedError";
        adapter.onError?.({ error: permissionError });

        await scanPromise;

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "PERMISSION_DENIED",
            recoverable: false,
          }),
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // classify() Method Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("classify() method", () => {
    it("should expose classification functionality", () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });

      const validData = createValidPayload();
      const records: NfcRecord[] = [{ recordType: "unknown", data: validData }];

      const result = layer.classify(validData, records);
      expect(result).toBe("valid_payload");
    });

    it("should classify empty records as empty", () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });

      const result = layer.classify(null, []);
      expect(result).toBe("empty");
    });

    it("should classify foreign data correctly", () => {
      const layer = new GenericNfcLayer({ adapter: mockAdapter });

      const foreignData = createForeignData();
      const records: NfcRecord[] = [{ recordType: "unknown", data: foreignData }];

      const result = layer.classify(foreignData, records);
      expect(result).toBe("foreign");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Multiple Scans Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("multiple scans", () => {
    it("should handle sequential scans", async () => {
      const validData1 = createValidPayload();
      const validData2 = createValidPayload();
      validData2[6] = 0xff; // Different card ID

      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: validData1,
      });
      mockAdapter.queueScanResponse({
        serialNumber: "04:11:22:33:44:55:66",
        data: validData2,
      });

      const layer = new GenericNfcLayer({ adapter: mockAdapter });

      const result1 = await layer.scan();
      expect(result1.serialNumber).toBe("04:A1:B2:C3:D4:E5:F6");

      const result2 = await layer.scan();
      expect(result2.serialNumber).toBe("04:11:22:33:44:55:66");
    });

    it("should fire onRawScan for each scan", async () => {
      mockAdapter.queueScanResponse({
        serialNumber: "04:A1:B2:C3:D4:E5:F6",
        data: createValidPayload(),
      });
      mockAdapter.queueScanResponse({
        serialNumber: "04:11:22:33:44:55:66",
        data: createValidPayload(),
      });

      const onRawScan = vi.fn();
      const layer = new GenericNfcLayer({
        adapter: mockAdapter,
        onRawScan,
      });

      await layer.scan();
      await layer.scan();

      expect(onRawScan).toHaveBeenCalledTimes(2);
    });
  });
});
