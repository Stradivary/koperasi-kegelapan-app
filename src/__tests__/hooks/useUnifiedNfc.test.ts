// @vitest-environment jsdom
/**
 * Tests for src/hooks/useUnifiedNfc.ts
 */
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockScan = vi.fn();
const mockAbort = vi.fn();
const mockIsSupported = vi.fn();
const mockReadAndValidateCard = vi.fn();
const mockPrepareWrite = vi.fn();
const mockCommitWrite = vi.fn();
const mockValidateSession = vi.fn();

vi.mock("#/core/nfc/genericNfcLayer", () => ({
  GenericNfcLayer: class MockGenericNfcLayer {
    scan = mockScan;
    abort = mockAbort;
    isSupported = mockIsSupported;
  },
}));

vi.mock("#/core/nfc/pipelineEngine", () => ({
  readAndValidateCard: (...args: unknown[]) => mockReadAndValidateCard(...args),
  prepareWrite: (...args: unknown[]) => mockPrepareWrite(...args),
  commitWrite: (...args: unknown[]) => mockCommitWrite(...args),
}));

vi.mock("#/core/nfc/sessionValidator", () => ({
  validateSession: (...args: unknown[]) => mockValidateSession(...args),
}));

vi.mock("#/core/nfc/stateMachine", () => {
  const initialNfcState = {
    phase: "idle",
    rawResult: null,
    classification: null,
    payload: null,
    error: null,
    tamperDetected: false,
  };

  function nfcReducer(
    state: typeof initialNfcState,
    action: { type: string; [key: string]: unknown },
  ) {
    switch (action.type) {
      case "START_SCAN":
        return { ...state, phase: "scanning" };
      case "RAW_SCAN_COMPLETE":
        return { ...state, rawResult: action.result };
      case "CLASSIFICATION_COMPLETE":
        return { ...state, phase: "ready", classification: action.classification };
      case "VALIDATION_COMPLETE":
        return { ...state, phase: "ready", payload: action.payload };
      case "START_WRITE":
        return { ...state, phase: "writing" };
      case "WRITE_COMPLETE":
        return { ...state, phase: "success", payload: action.payload };
      case "WRITE_PENDING_RETRY":
        return { ...state, phase: "write_pending_retry" };
      case "ERROR":
        return { ...state, phase: "error", error: action.error };
      case "RESET":
        return initialNfcState;
      case "CANCEL":
        return initialNfcState;
      default:
        return state;
    }
  }

  return { nfcReducer, initialNfcState };
});

import { useUnifiedNfc } from "#/presentation/hooks/useUnifiedNfc";
import type { SessionGrant } from "#/core/payload/types";

function makeGrant(): SessionGrant {
  return {
    keyVersion: 1,
    sessionKey: new Uint8Array(32),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    allowedOps: ["read", "write"],
    signature: new Uint8Array(32),
    tenantId: "t-1",
    accountId: "a-1",
    deviceId: "d-1",
  };
}

describe("useUnifiedNfc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsSupported.mockReturnValue(true);
    mockValidateSession.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with idle state", () => {
    const { result } = renderHook(() =>
      useUnifiedNfc({
        sessionGrant: makeGrant(),
        tenantId: "t-1",
        terminalId: 1,
      }),
    );

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.isNfcSupported).toBe(true);
    expect(result.current.hasPendingWrite).toBe(false);
  });

  it("reports NFC not supported when adapter says so", () => {
    mockIsSupported.mockReturnValue(false);

    const { result } = renderHook(() =>
      useUnifiedNfc({
        sessionGrant: makeGrant(),
        tenantId: "t-1",
        terminalId: 1,
      }),
    );

    expect(result.current.isNfcSupported).toBe(false);
  });

  describe("scan()", () => {
    it("transitions to scanning state and processes raw scan in raw mode", async () => {
      const rawResult = {
        classification: "blank",
        raw: new Uint8Array(0),
        serialNumber: "abc123",
      };
      mockScan.mockResolvedValue(rawResult);

      const onRawScan = vi.fn();
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "raw",
          onRawScan,
        }),
      );

      await act(async () => {
        await result.current.scan();
      });

      expect(mockScan).toHaveBeenCalled();
      expect(onRawScan).toHaveBeenCalledWith(rawResult);
      expect(result.current.state.phase).toBe("ready");
    });

    it("processes payload mode with valid session and card", async () => {
      const rawResult = {
        classification: "valid_payload",
        raw: new Uint8Array(128),
        serialNumber: "abc123",
      };
      mockScan.mockResolvedValue(rawResult);

      const mockPayload = { header: {}, identity: { name: "Test" }, wallet: { balance: 50000 } };
      mockReadAndValidateCard.mockResolvedValue({ ok: true, payload: mockPayload });

      const onCardRead = vi.fn();
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "payload",
          onCardRead,
        }),
      );

      await act(async () => {
        await result.current.scan();
      });

      expect(mockValidateSession).toHaveBeenCalled();
      expect(mockReadAndValidateCard).toHaveBeenCalled();
      expect(onCardRead).toHaveBeenCalledWith(mockPayload, rawResult);
    });

    it("dispatches error when session is invalid", async () => {
      const rawResult = {
        classification: "valid_payload",
        raw: new Uint8Array(128),
        serialNumber: "abc123",
      };
      mockScan.mockResolvedValue(rawResult);
      mockValidateSession.mockReturnValue({
        valid: false,
        errorCode: "SESSION_EXPIRED",
        error: "Session expired",
      });

      const onError = vi.fn();
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "payload",
          onError,
        }),
      );

      await act(async () => {
        await result.current.scan();
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: "SESSION_EXPIRED", recoverable: true }),
      );
      expect(result.current.state.phase).toBe("error");
    });

    it("dispatches error when pipeline fails", async () => {
      const rawResult = {
        classification: "valid_payload",
        raw: new Uint8Array(128),
        serialNumber: "abc123",
      };
      mockScan.mockResolvedValue(rawResult);
      mockReadAndValidateCard.mockResolvedValue({
        ok: false,
        error: "Decryption failed",
        tamper: false,
      });

      const onError = vi.fn();
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "payload",
          onError,
        }),
      );

      await act(async () => {
        await result.current.scan();
      });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "DECRYPTION_FAILED" }));
    });

    it("dispatches error on scan exception", async () => {
      mockScan.mockRejectedValue(new Error("NFC hardware error"));

      const onError = vi.fn();
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          onError,
        }),
      );

      await act(async () => {
        await result.current.scan();
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: "SCAN_FAILED", recoverable: true }),
      );
      expect(result.current.state.phase).toBe("error");
    });
  });

  describe("write()", () => {
    it("returns false when no grant or payload", async () => {
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: null,
          tenantId: "t-1",
          terminalId: 1,
        }),
      );

      let writeResult: boolean;
      await act(async () => {
        writeResult = await result.current.write({} as any);
      });

      expect(writeResult!).toBe(false);
    });
  });

  describe("reset()", () => {
    it("resets state to idle", async () => {
      const rawResult = {
        classification: "blank",
        raw: new Uint8Array(0),
        serialNumber: "abc123",
      };
      mockScan.mockResolvedValue(rawResult);

      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "raw",
        }),
      );

      await act(async () => {
        await result.current.scan();
      });

      expect(result.current.state.phase).toBe("ready");

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.phase).toBe("idle");
    });
  });

  describe("cancel()", () => {
    it("aborts the generic layer and resets state", () => {
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
        }),
      );

      act(() => {
        result.current.cancel();
      });

      expect(mockAbort).toHaveBeenCalled();
      expect(result.current.state.phase).toBe("idle");
    });
  });

  describe("payloadLayer", () => {
    it("returns non-null when scanMode is payload and session exists", () => {
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "payload",
        }),
      );

      expect(result.current.payloadLayer).not.toBeNull();
    });

    it("returns null when scanMode is raw", () => {
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: makeGrant(),
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "raw",
        }),
      );

      expect(result.current.payloadLayer).toBeNull();
    });

    it("returns null when no session grant", () => {
      const { result } = renderHook(() =>
        useUnifiedNfc({
          sessionGrant: null,
          tenantId: "t-1",
          terminalId: 1,
          scanMode: "payload",
        }),
      );

      expect(result.current.payloadLayer).toBeNull();
    });
  });
});
