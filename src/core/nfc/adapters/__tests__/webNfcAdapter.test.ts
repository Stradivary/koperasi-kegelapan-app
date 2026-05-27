/**
 * Tests for WebNfcAdapter
 *
 * Covers the uncovered lines in webNfcAdapter.ts by mocking NDEFReader.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebNfcAdapter } from "../webNfcAdapter";

// ── Mock NDEFReader ────────────────────────────────────────────────────

type ReadingHandler = (event: {
  serialNumber: string;
  message: { records: { recordType: string; data: DataView | null }[] };
}) => void;
type ErrorHandler = (event: { error: DOMException }) => void;

class MockNDEFReader {
  static instances: MockNDEFReader[] = [];

  onReading: ReadingHandler | null = null;
  onError: ErrorHandler | null = null;
  private handlers: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  scanFn = vi.fn().mockResolvedValue(undefined);
  writeFn = vi.fn().mockResolvedValue(undefined);

  constructor() {
    MockNDEFReader.instances.push(this);
  }

  addEventListener(type: string, handler: (...args: unknown[]) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  removeEventListener(type: string, handler: (...args: unknown[]) => void) {
    const list = this.handlers.get(type) ?? [];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  async scan(options?: { signal?: AbortSignal }) {
    return this.scanFn(options);
  }

  async write(message: unknown, options?: unknown) {
    return this.writeFn(message, options);
  }

  // Test helpers
  simulateReading(serialNumber: string, records: { recordType: string; data: DataView | null }[]) {
    const handlers = this.handlers.get("reading") ?? [];
    for (const h of handlers) h({ serialNumber, message: { records } });
  }

  simulateReadError(error: DOMException) {
    const handlers = this.handlers.get("readingerror") ?? [];
    for (const h of handlers) h({ error });
  }
}

function installMockNDEFReader() {
  MockNDEFReader.instances = [];
  Object.defineProperty(globalThis, "NDEFReader", {
    value: MockNDEFReader,
    configurable: true,
    writable: true,
  });
}

function removeMockNDEFReader() {
  // @ts-ignore
  delete (globalThis as any).NDEFReader;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("WebNfcAdapter", () => {
  beforeEach(() => {
    installMockNDEFReader();
  });

  afterEach(() => {
    removeMockNDEFReader();
    vi.restoreAllMocks();
  });

  describe("isSupported()", () => {
    it("returns true when NDEFReader is available", () => {
      const adapter = new WebNfcAdapter();
      expect(adapter.isSupported()).toBe(true);
    });

    it("returns false when NDEFReader is not available", () => {
      removeMockNDEFReader();
      const adapter = new WebNfcAdapter();
      expect(adapter.isSupported()).toBe(false);
    });
  });

  describe("getCapabilities()", () => {
    it("returns full capabilities when supported", () => {
      const adapter = new WebNfcAdapter();
      const caps = adapter.getCapabilities();
      expect(caps.canRead).toBe(true);
      expect(caps.canWrite).toBe(true);
      expect(caps.supportedRecordTypes).toContain("text");
    });

    it("returns empty capabilities when not supported", () => {
      removeMockNDEFReader();
      const adapter = new WebNfcAdapter();
      const caps = adapter.getCapabilities();
      expect(caps.canRead).toBe(false);
      expect(caps.canWrite).toBe(false);
      expect(caps.supportedRecordTypes).toHaveLength(0);
    });
  });

  describe("scan()", () => {
    it("throws and calls onError when NDEFReader is not available", async () => {
      removeMockNDEFReader();
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      await expect(adapter.scan()).rejects.toThrow("NFC tidak tersedia");
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ name: "NotSupportedError" }) }),
      );
    });

    it("calls onReading when a tag is scanned", async () => {
      const adapter = new WebNfcAdapter();
      const onReading = vi.fn();
      adapter.onReading = onReading;

      const scanPromise = adapter.scan();
      const reader = MockNDEFReader.instances[0];

      // Simulate a reading event
      const dataView = new DataView(new Uint8Array([0x01, 0x02]).buffer);
      reader.simulateReading("04:A1:B2:C3", [{ recordType: "unknown", data: dataView }]);

      await scanPromise;

      expect(onReading).toHaveBeenCalledWith(
        expect.objectContaining({
          serialNumber: "04:A1:B2:C3",
          message: expect.objectContaining({
            records: expect.arrayContaining([expect.objectContaining({ recordType: "unknown" })]),
          }),
        }),
      );
    });

    it("handles record with null data", async () => {
      const adapter = new WebNfcAdapter();
      const onReading = vi.fn();
      adapter.onReading = onReading;

      const scanPromise = adapter.scan();
      const reader = MockNDEFReader.instances[0];

      reader.simulateReading("04:A1:B2:C3", [{ recordType: "empty", data: null }]);

      await scanPromise;

      expect(onReading).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            records: expect.arrayContaining([
              expect.objectContaining({ recordType: "empty", data: null }),
            ]),
          }),
        }),
      );
    });

    it("calls onError when a readingerror event fires", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      const scanPromise = adapter.scan();
      const reader = MockNDEFReader.instances[0];

      const domError = new DOMException("Tag lost", "NetworkError");
      reader.simulateReadError(domError);

      await scanPromise;

      expect(onError).toHaveBeenCalled();
    });

    it("throws when scan() rejects with DOMException", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      // Make scan reject before it's called
      const domError = new DOMException("Permission denied", "NotAllowedError");

      // We need to set up the mock before scan() is called
      installMockNDEFReader();
      const adapter2 = new WebNfcAdapter();
      adapter2.onError = onError;

      // Override the scan method on the next instance
      const origCtor = (globalThis as any).NDEFReader;
      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async scan() {
          throw domError;
        }
      };

      await expect(adapter2.scan()).rejects.toThrow();
      expect(onError).toHaveBeenCalled();

      (globalThis as any).NDEFReader = origCtor;
    });

    it("aborts immediately if signal is already aborted", async () => {
      const adapter = new WebNfcAdapter();
      const controller = new AbortController();
      controller.abort();

      await expect(adapter.scan({ signal: controller.signal })).rejects.toThrow();
    });

    it("aborts when external signal fires", async () => {
      const adapter = new WebNfcAdapter();
      const controller = new AbortController();

      // Make scan hang until aborted
      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async scan(opts?: { signal?: AbortSignal }) {
          return new Promise<void>((_, reject) => {
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          });
        }
      };

      const scanPromise = adapter.scan({ signal: controller.signal });
      controller.abort();

      await expect(scanPromise).rejects.toThrow();
    });
  });

  describe("write()", () => {
    it("throws and calls onError when NDEFReader is not available", async () => {
      removeMockNDEFReader();
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      await expect(adapter.write(new Uint8Array([1, 2, 3]))).rejects.toThrow("NFC tidak tersedia");
      expect(onError).toHaveBeenCalled();
    });

    it("writes data successfully", async () => {
      const adapter = new WebNfcAdapter();
      await expect(adapter.write(new Uint8Array([0x01, 0x02, 0x03]))).resolves.toBeUndefined();
    });

    it("passes overwrite option to NDEFReader.write", async () => {
      const adapter = new WebNfcAdapter();
      const writeSpy = vi.fn().mockResolvedValue(undefined);

      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async write(_msg: unknown, opts?: unknown) {
          return writeSpy(_msg, opts);
        }
      };

      await adapter.write(new Uint8Array([1]), { overwrite: true });
      expect(writeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ overwrite: true }),
      );
    });

    it("throws when write() rejects with DOMException", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async write() {
          throw new DOMException("Write failed", "NotSupportedError");
        }
      };

      await expect(adapter.write(new Uint8Array([1]))).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
    });

    it("throws when write() rejects with non-DOMException", async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async write() {
          throw new Error("Generic error");
        }
      };

      await expect(adapter.write(new Uint8Array([1]))).rejects.toThrow("Generic error");
      expect(onError).toHaveBeenCalled();
    });

    it("aborts immediately if signal is already aborted", async () => {
      const adapter = new WebNfcAdapter();
      const controller = new AbortController();
      controller.abort();

      await expect(
        adapter.write(new Uint8Array([1]), { signal: controller.signal }),
      ).rejects.toThrow();
    });
  });

  describe("abort()", () => {
    it("aborts the current scan operation", async () => {
      const adapter = new WebNfcAdapter();

      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async scan(opts?: { signal?: AbortSignal }) {
          return new Promise<void>((_, reject) => {
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          });
        }
      };

      const scanPromise = adapter.scan().catch(() => {});
      adapter.abort();
      await scanPromise;
    });

    it("does not throw when called without active scan", () => {
      const adapter = new WebNfcAdapter();
      expect(() => adapter.abort()).not.toThrow();
    });
  });

  describe("onReading not set", () => {
    it("does not throw when onReading is null and a reading event fires", async () => {
      const adapter = new WebNfcAdapter();
      adapter.onReading = null;

      const scanPromise = adapter.scan();
      const reader = MockNDEFReader.instances.at(-1);

      reader?.simulateReading("04:A1:B2:C3", []);
      await scanPromise;
      // No error thrown
    });
  });
});

describe("friendlyErrorMessage coverage via scan errors", () => {
  beforeEach(() => {
    installMockNDEFReader();
  });

  afterEach(() => {
    removeMockNDEFReader();
  });

  const errorCases: Array<{ name: string; message: string; expectedFragment: string }> = [
    { name: "NotAllowedError", message: "permission denied", expectedFragment: "Izin NFC" },
    { name: "AbortError", message: "aborted", expectedFragment: "dibatalkan" },
    { name: "NotSupportedError", message: "ndef not supported", expectedFragment: "NDEF" },
    { name: "NotSupportedError", message: "not supported", expectedFragment: "tidak didukung" },
    { name: "NetworkError", message: "io error", expectedFragment: "kartu dipindahkan" },
    { name: "NetworkError", message: "ndef data", expectedFragment: "NDEF" },
    { name: "NetworkError", message: "timeout occurred", expectedFragment: "Waktu habis" },
    { name: "NetworkError", message: "network failure", expectedFragment: "Koneksi" },
    { name: "NetworkError", message: "unknown error", expectedFragment: "unknown error" },
  ];

  for (const { name, message, expectedFragment } of errorCases) {
    it(`maps ${name}/${message} to friendly message containing "${expectedFragment}"`, async () => {
      const adapter = new WebNfcAdapter();
      const onError = vi.fn();
      adapter.onError = onError;

      (globalThis as any).NDEFReader = class extends MockNDEFReader {
        async scan() {
          const err = new DOMException(message, name);
          throw err;
        }
      };

      await adapter.scan().catch(() => {});

      expect(onError).toHaveBeenCalled();
      const errorMsg = onError.mock.calls[0][0].error.message;
      expect(errorMsg).toContain(expectedFragment);
    });
  }
});
