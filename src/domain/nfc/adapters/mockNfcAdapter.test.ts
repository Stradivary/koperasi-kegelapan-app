/**
 * Unit tests for MockNfcAdapter
 *
 * Tests the mock adapter's ability to simulate NFC operations for testing purposes.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MockNfcAdapter,
  createMockAdapter,
  createUnsupportedAdapter,
  createSuccessAdapter,
  createErrorAdapter,
  createReadOnlyAdapter,
} from "./mockNfcAdapter";
import type { NfcReadingEvent, NfcErrorEvent } from "./types";

describe("MockNfcAdapter", () => {
  let adapter: MockNfcAdapter;

  beforeEach(() => {
    adapter = new MockNfcAdapter();
  });

  describe("isSupported", () => {
    it("returns true by default", () => {
      expect(adapter.isSupported()).toBe(true);
    });

    it("returns false when configured as unsupported", () => {
      adapter = new MockNfcAdapter({ isSupported: false });
      expect(adapter.isSupported()).toBe(false);
    });

    it("can be changed via setSupported", () => {
      adapter.setSupported(false);
      expect(adapter.isSupported()).toBe(false);
      adapter.setSupported(true);
      expect(adapter.isSupported()).toBe(true);
    });

    it("records the method call", () => {
      adapter.isSupported();
      expect(adapter.wasCalled("isSupported")).toBe(true);
      expect(adapter.callCount("isSupported")).toBe(1);
    });
  });

  describe("getCapabilities", () => {
    it("returns default capabilities", () => {
      const caps = adapter.getCapabilities();
      expect(caps.canRead).toBe(true);
      expect(caps.canWrite).toBe(true);
      expect(caps.supportedRecordTypes).toContain("text");
      expect(caps.supportedRecordTypes).toContain("unknown");
    });

    it("returns configured capabilities", () => {
      adapter = new MockNfcAdapter({
        capabilities: { canRead: true, canWrite: false },
      });
      const caps = adapter.getCapabilities();
      expect(caps.canRead).toBe(true);
      expect(caps.canWrite).toBe(false);
    });

    it("can be changed via setCapabilities", () => {
      adapter.setCapabilities({ canWrite: false });
      expect(adapter.getCapabilities().canWrite).toBe(false);
    });

    it("records the method call", () => {
      adapter.getCapabilities();
      expect(adapter.wasCalled("getCapabilities")).toBe(true);
    });
  });

  describe("scan", () => {
    it("throws error when NFC is not supported", async () => {
      adapter = createUnsupportedAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      await expect(adapter.scan()).rejects.toThrow("NFC not supported");
      expect(onError).toHaveBeenCalled();
    });

    it("returns queued scan response", async () => {
      const testData = new Uint8Array([1, 2, 3, 4]);
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "04:A1:B2:C3", data: testData }],
      });

      const onReading = vi.fn();
      adapter.onReading = onReading;

      await adapter.scan();

      expect(onReading).toHaveBeenCalledTimes(1);
      const event: NfcReadingEvent = onReading.mock.calls[0][0];
      expect(event.serialNumber).toBe("04:A1:B2:C3");
      expect(event.message.records[0].data).toEqual(testData);
    });

    it("returns queued error response", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ code: "SCAN_FAILED", message: "Tag lost" }],
      });

      const onError = vi.fn();
      adapter.onError = onError;

      await adapter.scan();

      expect(onError).toHaveBeenCalledTimes(1);
      const event: NfcErrorEvent = onError.mock.calls[0][0];
      expect(event.error.message).toBe("Tag lost");
      expect(event.error.name).toBe("SCAN_FAILED");
    });

    it("processes multiple queued responses in order", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [
          { serialNumber: "first", data: null },
          { serialNumber: "second", data: null },
          { code: "SCAN_FAILED", message: "Error" },
        ],
      });

      const onReading = vi.fn();
      const onError = vi.fn();
      adapter.onReading = onReading;
      adapter.onError = onError;

      await adapter.scan();
      expect(onReading).toHaveBeenCalledTimes(1);
      expect(onReading.mock.calls[0][0].serialNumber).toBe("first");

      await adapter.scan();
      expect(onReading).toHaveBeenCalledTimes(2);
      expect(onReading.mock.calls[1][0].serialNumber).toBe("second");

      await adapter.scan();
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("respects configured delay", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null, delay: 50 }],
      });

      const onReading = vi.fn();
      adapter.onReading = onReading;

      const start = Date.now();
      await adapter.scan();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(onReading).toHaveBeenCalled();
    });

    it("can be aborted via signal", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null, delay: 1000 }],
      });

      const abortController = new AbortController();

      const scanPromise = adapter.scan({ signal: abortController.signal });

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 10);

      await expect(scanPromise).rejects.toThrow("aborted");
    });

    it("can be aborted via abort() method", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null, delay: 1000 }],
      });

      const scanPromise = adapter.scan();

      // Abort after a short delay
      setTimeout(() => adapter.abort(), 10);

      await expect(scanPromise).rejects.toThrow("aborted");
    });

    it("throws error when scan is already in progress", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null, delay: 100 }],
      });

      const onError = vi.fn();
      adapter.onError = onError;

      const firstScan = adapter.scan();

      await expect(adapter.scan()).rejects.toThrow("already in progress");

      adapter.abort();
      await expect(firstScan).rejects.toThrow();
    });

    it("records the method call", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null }],
      });
      adapter.onReading = vi.fn();

      await adapter.scan();

      expect(adapter.wasCalled("scan")).toBe(true);
      expect(adapter.callCount("scan")).toBe(1);
    });
  });

  describe("write", () => {
    it("throws error when NFC is not supported", async () => {
      adapter = createUnsupportedAdapter();
      await expect(adapter.write(new Uint8Array([1, 2, 3]))).rejects.toThrow("NFC not supported");
    });

    it("throws error when write is not supported", async () => {
      adapter = createReadOnlyAdapter();
      await expect(adapter.write(new Uint8Array([1, 2, 3]))).rejects.toThrow("Write not supported");
    });

    it("succeeds by default", async () => {
      await expect(adapter.write(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
    });

    it("returns queued write response", async () => {
      adapter = new MockNfcAdapter({
        writeResponses: [
          { success: true },
          { success: false, error: { code: "WRITE_FAILED", message: "Write error" } },
        ],
      });

      await expect(adapter.write(new Uint8Array([1]))).resolves.toBeUndefined();
      await expect(adapter.write(new Uint8Array([2]))).rejects.toThrow("Write error");
    });

    it("respects configured delay", async () => {
      adapter = new MockNfcAdapter({
        writeResponses: [{ success: true, delay: 50 }],
      });

      const start = Date.now();
      await adapter.write(new Uint8Array([1, 2, 3]));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it("records the method call with data", async () => {
      const data = new Uint8Array([1, 2, 3]);
      await adapter.write(data);

      const calls = adapter.getCallsFor("write");
      expect(calls).toHaveLength(1);
      expect(calls[0].args?.[0]).toEqual(data);
    });
  });

  describe("abort", () => {
    it("records the method call", () => {
      adapter.abort();
      expect(adapter.wasCalled("abort")).toBe(true);
    });

    it("sets isCurrentlyScanning to false", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null, delay: 1000 }],
      });

      const scanPromise = adapter.scan();
      expect(adapter.isCurrentlyScanning).toBe(true);

      adapter.abort();
      expect(adapter.isCurrentlyScanning).toBe(false);

      await expect(scanPromise).rejects.toThrow();
    });
  });

  describe("simulateScan", () => {
    it("triggers onReading callback", async () => {
      const onReading = vi.fn();
      adapter.onReading = onReading;

      // Start a scan that waits indefinitely
      const scanPromise = adapter.scan();

      // Simulate a scan
      adapter.simulateScan({ serialNumber: "manual", data: new Uint8Array([5, 6, 7]) });

      expect(onReading).toHaveBeenCalledTimes(1);
      expect(onReading.mock.calls[0][0].serialNumber).toBe("manual");

      // Clean up
      adapter.abort();
      await expect(scanPromise).rejects.toThrow();
    });

    it("throws error when not scanning", () => {
      expect(() => adapter.simulateScan({ serialNumber: "test", data: null })).toThrow(
        "Cannot simulate scan when not scanning",
      );
    });
  });

  describe("simulateError", () => {
    it("triggers onError callback", () => {
      const onError = vi.fn();
      adapter.onError = onError;

      adapter.simulateError({ code: "PERMISSION_DENIED", message: "Access denied" });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].error.message).toBe("Access denied");
      expect(onError.mock.calls[0][0].error.name).toBe("PERMISSION_DENIED");
    });
  });

  describe("call tracking", () => {
    it("getCalls returns all calls in order", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [{ serialNumber: "test", data: null }],
      });
      adapter.onReading = vi.fn();

      adapter.isSupported();
      adapter.getCapabilities();
      await adapter.scan();

      const calls = adapter.getCalls();
      expect(calls).toHaveLength(3);
      expect(calls[0].method).toBe("isSupported");
      expect(calls[1].method).toBe("getCapabilities");
      expect(calls[2].method).toBe("scan");
    });

    it("getCallsFor filters by method", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [
          { serialNumber: "test1", data: null },
          { serialNumber: "test2", data: null },
        ],
      });
      adapter.onReading = vi.fn();

      adapter.isSupported();
      await adapter.scan();
      adapter.isSupported();
      await adapter.scan();

      expect(adapter.getCallsFor("isSupported")).toHaveLength(2);
      expect(adapter.getCallsFor("scan")).toHaveLength(2);
    });

    it("resetCalls clears call history", () => {
      adapter.isSupported();
      adapter.getCapabilities();

      expect(adapter.getCalls()).toHaveLength(2);

      adapter.resetCalls();

      expect(adapter.getCalls()).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("resets response indices", async () => {
      adapter = new MockNfcAdapter({
        scanResponses: [
          { serialNumber: "first", data: null },
          { serialNumber: "second", data: null },
        ],
      });

      const onReading = vi.fn();
      adapter.onReading = onReading;

      await adapter.scan();
      expect(onReading.mock.calls[0][0].serialNumber).toBe("first");

      adapter.reset();
      onReading.mockClear();

      await adapter.scan();
      expect(onReading.mock.calls[0][0].serialNumber).toBe("first");
    });

    it("clears call history", () => {
      adapter.isSupported();
      adapter.reset();
      expect(adapter.getCalls()).toHaveLength(0);
    });
  });

  describe("queueScanResponse", () => {
    it("adds responses to the queue", async () => {
      const onReading = vi.fn();
      adapter.onReading = onReading;

      adapter.queueScanResponse({ serialNumber: "queued", data: null });

      await adapter.scan();

      expect(onReading).toHaveBeenCalledTimes(1);
      expect(onReading.mock.calls[0][0].serialNumber).toBe("queued");
    });

    it("adds multiple responses", async () => {
      const onReading = vi.fn();
      adapter.onReading = onReading;

      adapter.queueScanResponse(
        { serialNumber: "first", data: null },
        { serialNumber: "second", data: null },
      );

      await adapter.scan();
      await adapter.scan();

      expect(onReading).toHaveBeenCalledTimes(2);
    });
  });

  describe("queueWriteResponse", () => {
    it("adds responses to the queue", async () => {
      adapter.queueWriteResponse({ success: true });
      adapter.queueWriteResponse({
        success: false,
        error: { code: "WRITE_FAILED", message: "Error" },
      });

      await expect(adapter.write(new Uint8Array([1]))).resolves.toBeUndefined();
      await expect(adapter.write(new Uint8Array([2]))).rejects.toThrow("Error");
    });
  });
});

describe("Factory functions", () => {
  describe("createMockAdapter", () => {
    it("creates adapter with default config", () => {
      const adapter = createMockAdapter();
      expect(adapter.isSupported()).toBe(true);
    });

    it("creates adapter with custom config", () => {
      const adapter = createMockAdapter({ isSupported: false });
      expect(adapter.isSupported()).toBe(false);
    });
  });

  describe("createUnsupportedAdapter", () => {
    it("creates adapter that reports NFC as unsupported", () => {
      const adapter = createUnsupportedAdapter();
      expect(adapter.isSupported()).toBe(false);
    });
  });

  describe("createSuccessAdapter", () => {
    it("creates adapter with single success response", async () => {
      const data = new Uint8Array([1, 2, 3]);
      const adapter = createSuccessAdapter("test-serial", data);

      const onReading = vi.fn();
      adapter.onReading = onReading;

      await adapter.scan();

      expect(onReading).toHaveBeenCalledTimes(1);
      expect(onReading.mock.calls[0][0].serialNumber).toBe("test-serial");
      expect(onReading.mock.calls[0][0].message.records[0].data).toEqual(data);
    });
  });

  describe("createErrorAdapter", () => {
    it("creates adapter that returns error", async () => {
      const adapter = createErrorAdapter("PERMISSION_DENIED", "Access denied");

      const onError = vi.fn();
      adapter.onError = onError;

      await adapter.scan();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].error.name).toBe("PERMISSION_DENIED");
    });
  });

  describe("createReadOnlyAdapter", () => {
    it("creates adapter that cannot write", async () => {
      const adapter = createReadOnlyAdapter();

      expect(adapter.getCapabilities().canRead).toBe(true);
      expect(adapter.getCapabilities().canWrite).toBe(false);

      await expect(adapter.write(new Uint8Array([1]))).rejects.toThrow("Write not supported");
    });
  });
});
