/**
 * Unit tests for NFC State Machine
 *
 * Tests the nfcReducer function for all state transitions:
 * - Phase sequence: idle → scanning → classifying → validating/ready → writing → success
 * - Cancel from any active phase → idle
 * - Reset → idle with cleared data
 * - Invalid transitions are ignored
 *
 * @see Requirements 9.1, 19.1, 19.2, 19.3, 19.4
 */

import { describe, it, expect } from "vitest";
import { nfcReducer, initialNfcState, type NfcState, type NfcAction } from "./stateMachine";
import type { RawNfcResult } from "./types";
import type { CardPayload } from "../payload/types";
import type { NfcError } from "./adapters/types";
import type { PayloadError } from "./payloadTypes";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRawResult(overrides: Partial<RawNfcResult> = {}): RawNfcResult {
  return {
    serialNumber: "04:A2:B3:C4:D5:E6:F7",
    rawBytes: new Uint8Array([0x4b, 0x4f, 0x50, 0x57, 0x02, 0x00]),
    records: [{ recordType: "unknown", data: new Uint8Array([1, 2, 3]) }],
    classification: "valid_payload",
    metadata: { recordCount: 1, totalBytes: 6, hasNdef: true },
    ...overrides,
  };
}

function createMockPayload(overrides: Partial<CardPayload> = {}): CardPayload {
  return {
    header: {
      magic: 0x4b4f5057,
      version: 2,
      type: 0,
      cardId: new Uint8Array([1, 2, 3, 4, 5, 6]),
    },
    identity: {
      name: "Test User",
      userId: 1,
      gender: 0,
      status: 0,
      createdAt: 1700000000,
    },
    wallet: {
      balance: 50000,
      lastBalance: 45000,
      counter: BigInt(10),
      lastTimestamp: 1700000000,
      state: 0, // IDLE
      flags: 0,
    },
    session: {
      startTime: 0,
      endTime: 0,
      terminalId: 0,
    },
    logEntries: [],
    trailer: {
      expiresAt: 1800000000,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 10,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
    ...overrides,
  };
}

function createMockNfcError(overrides: Partial<NfcError> = {}): NfcError {
  return {
    code: "SCAN_FAILED",
    message: "Gagal membaca kartu",
    recoverable: true,
    ...overrides,
  };
}

function createMockPayloadError(overrides: Partial<PayloadError> = {}): PayloadError {
  return {
    code: "VALIDATION_FAILED",
    message: "Validasi kartu gagal",
    tamperDetected: true,
    recoverable: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("nfcReducer", () => {
  describe("initial state", () => {
    it("should have idle phase with all null values", () => {
      expect(initialNfcState).toEqual({
        phase: "idle",
        rawResult: null,
        payload: null,
        classification: null,
        error: null,
        tamperDetected: false,
        isCheckedIn: false,
      });
    });
  });

  describe("START_SCAN", () => {
    it("should transition from idle to scanning", () => {
      const result = nfcReducer(initialNfcState, { type: "START_SCAN" });

      expect(result.phase).toBe("scanning");
      expect(result.rawResult).toBeNull();
      expect(result.payload).toBeNull();
      expect(result.error).toBeNull();
    });

    it("should transition from error to scanning (retry)", () => {
      const errorState: NfcState = {
        ...initialNfcState,
        phase: "error",
        error: createMockNfcError(),
      };

      const result = nfcReducer(errorState, { type: "START_SCAN" });

      expect(result.phase).toBe("scanning");
      expect(result.error).toBeNull();
    });

    it("should clear previous data when starting a new scan", () => {
      const errorState: NfcState = {
        ...initialNfcState,
        phase: "error",
        rawResult: createMockRawResult(),
        payload: createMockPayload(),
        classification: "valid_payload",
        error: createMockNfcError(),
        tamperDetected: true,
      };

      const result = nfcReducer(errorState, { type: "START_SCAN" });

      expect(result.rawResult).toBeNull();
      expect(result.payload).toBeNull();
      expect(result.classification).toBeNull();
      expect(result.error).toBeNull();
      expect(result.tamperDetected).toBe(false);
    });

    it("should ignore START_SCAN from scanning phase", () => {
      const scanningState: NfcState = {
        ...initialNfcState,
        phase: "scanning",
      };

      const result = nfcReducer(scanningState, { type: "START_SCAN" });
      expect(result).toBe(scanningState);
    });

    it("should ignore START_SCAN from ready phase", () => {
      const readyState: NfcState = { ...initialNfcState, phase: "ready" };

      const result = nfcReducer(readyState, { type: "START_SCAN" });
      expect(result).toBe(readyState);
    });
  });

  describe("RAW_SCAN_COMPLETE", () => {
    it("should transition from scanning to classifying with raw result", () => {
      const scanningState: NfcState = {
        ...initialNfcState,
        phase: "scanning",
      };
      const rawResult = createMockRawResult();

      const result = nfcReducer(scanningState, {
        type: "RAW_SCAN_COMPLETE",
        result: rawResult,
      });

      expect(result.phase).toBe("classifying");
      expect(result.rawResult).toBe(rawResult);
    });

    it("should ignore RAW_SCAN_COMPLETE from idle phase", () => {
      const rawResult = createMockRawResult();

      const result = nfcReducer(initialNfcState, {
        type: "RAW_SCAN_COMPLETE",
        result: rawResult,
      });

      expect(result).toBe(initialNfcState);
    });
  });

  describe("CLASSIFICATION_COMPLETE", () => {
    it("should transition to validating when classification is valid_payload", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult(),
      };

      const result = nfcReducer(classifyingState, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "valid_payload",
      });

      expect(result.phase).toBe("validating");
      expect(result.classification).toBe("valid_payload");
    });

    it("should transition to ready when classification is empty", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult({ classification: "empty" }),
      };

      const result = nfcReducer(classifyingState, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "empty",
      });

      expect(result.phase).toBe("ready");
      expect(result.classification).toBe("empty");
    });

    it("should transition to ready when classification is foreign", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult({ classification: "foreign" }),
      };

      const result = nfcReducer(classifyingState, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "foreign",
      });

      expect(result.phase).toBe("ready");
      expect(result.classification).toBe("foreign");
    });

    it("should transition to ready when classification is invalid_format", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult({ classification: "invalid_format" }),
      };

      const result = nfcReducer(classifyingState, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "invalid_format",
      });

      expect(result.phase).toBe("ready");
      expect(result.classification).toBe("invalid_format");
    });

    it("should transition to ready when classification is unknown", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult({ classification: "unknown" }),
      };

      const result = nfcReducer(classifyingState, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "unknown",
      });

      expect(result.phase).toBe("ready");
      expect(result.classification).toBe("unknown");
    });

    it("should ignore CLASSIFICATION_COMPLETE from non-classifying phase", () => {
      const result = nfcReducer(initialNfcState, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "valid_payload",
      });

      expect(result).toBe(initialNfcState);
    });
  });

  describe("VALIDATION_COMPLETE", () => {
    it("should transition from validating to ready with payload", () => {
      const validatingState: NfcState = {
        ...initialNfcState,
        phase: "validating",
        rawResult: createMockRawResult(),
        classification: "valid_payload",
      };
      const payload = createMockPayload();

      const result = nfcReducer(validatingState, {
        type: "VALIDATION_COMPLETE",
        payload,
      });

      expect(result.phase).toBe("ready");
      expect(result.payload).toBe(payload);
    });

    it("should set isCheckedIn to true when wallet state is CHECKED_IN", () => {
      const validatingState: NfcState = {
        ...initialNfcState,
        phase: "validating",
        classification: "valid_payload",
      };
      const payload = createMockPayload({
        wallet: {
          balance: 50000,
          lastBalance: 45000,
          counter: BigInt(10),
          lastTimestamp: 1700000000,
          state: 1, // CHECKED_IN
          flags: 0,
        },
      });

      const result = nfcReducer(validatingState, {
        type: "VALIDATION_COMPLETE",
        payload,
      });

      expect(result.isCheckedIn).toBe(true);
    });

    it("should set isCheckedIn to false when wallet state is IDLE", () => {
      const validatingState: NfcState = {
        ...initialNfcState,
        phase: "validating",
        classification: "valid_payload",
      };
      const payload = createMockPayload({
        wallet: {
          balance: 50000,
          lastBalance: 45000,
          counter: BigInt(10),
          lastTimestamp: 1700000000,
          state: 0, // IDLE
          flags: 0,
        },
      });

      const result = nfcReducer(validatingState, {
        type: "VALIDATION_COMPLETE",
        payload,
      });

      expect(result.isCheckedIn).toBe(false);
    });

    it("should ignore VALIDATION_COMPLETE from non-validating phase", () => {
      const payload = createMockPayload();

      const result = nfcReducer(initialNfcState, {
        type: "VALIDATION_COMPLETE",
        payload,
      });

      expect(result).toBe(initialNfcState);
    });
  });

  describe("START_WRITE", () => {
    it("should transition from ready to writing", () => {
      const readyState: NfcState = {
        ...initialNfcState,
        phase: "ready",
        payload: createMockPayload(),
        classification: "valid_payload",
      };

      const result = nfcReducer(readyState, { type: "START_WRITE" });

      expect(result.phase).toBe("writing");
      expect(result.payload).toBe(readyState.payload);
    });

    it("should ignore START_WRITE from non-ready phase", () => {
      const result = nfcReducer(initialNfcState, { type: "START_WRITE" });
      expect(result).toBe(initialNfcState);
    });
  });

  describe("WRITE_COMPLETE", () => {
    it("should transition from writing to success with updated payload", () => {
      const writingState: NfcState = {
        ...initialNfcState,
        phase: "writing",
        payload: createMockPayload(),
        classification: "valid_payload",
      };
      const updatedPayload = createMockPayload({
        wallet: {
          balance: 45000,
          lastBalance: 50000,
          counter: BigInt(11),
          lastTimestamp: 1700001000,
          state: 1, // CHECKED_IN
          flags: 0,
        },
      });

      const result = nfcReducer(writingState, {
        type: "WRITE_COMPLETE",
        payload: updatedPayload,
      });

      expect(result.phase).toBe("success");
      expect(result.payload).toBe(updatedPayload);
      expect(result.isCheckedIn).toBe(true);
    });

    it("should ignore WRITE_COMPLETE from non-writing phase", () => {
      const payload = createMockPayload();

      const result = nfcReducer(initialNfcState, {
        type: "WRITE_COMPLETE",
        payload,
      });

      expect(result).toBe(initialNfcState);
    });
  });

  describe("ERROR", () => {
    it("should transition from scanning to error", () => {
      const scanningState: NfcState = {
        ...initialNfcState,
        phase: "scanning",
      };
      const error = createMockNfcError();

      const result = nfcReducer(scanningState, { type: "ERROR", error });

      expect(result.phase).toBe("error");
      expect(result.error).toBe(error);
    });

    it("should transition from classifying to error", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult(),
      };
      const error = createMockNfcError();

      const result = nfcReducer(classifyingState, { type: "ERROR", error });

      expect(result.phase).toBe("error");
      expect(result.error).toBe(error);
    });

    it("should transition from validating to error with tamperDetected", () => {
      const validatingState: NfcState = {
        ...initialNfcState,
        phase: "validating",
        rawResult: createMockRawResult(),
        classification: "valid_payload",
      };
      const error = createMockPayloadError({ tamperDetected: true });

      const result = nfcReducer(validatingState, { type: "ERROR", error });

      expect(result.phase).toBe("error");
      expect(result.error).toBe(error);
      expect(result.tamperDetected).toBe(true);
    });

    it("should transition from writing to error", () => {
      const writingState: NfcState = {
        ...initialNfcState,
        phase: "writing",
        payload: createMockPayload(),
      };
      const error = createMockNfcError({ code: "WRITE_FAILED" });

      const result = nfcReducer(writingState, { type: "ERROR", error });

      expect(result.phase).toBe("error");
      expect(result.error).toBe(error);
    });

    it("should set tamperDetected to false for NfcError (no tamperDetected field)", () => {
      const scanningState: NfcState = {
        ...initialNfcState,
        phase: "scanning",
      };
      const error = createMockNfcError();

      const result = nfcReducer(scanningState, { type: "ERROR", error });

      expect(result.tamperDetected).toBe(false);
    });

    it("should set tamperDetected to false for PayloadError with tamperDetected=false", () => {
      const validatingState: NfcState = {
        ...initialNfcState,
        phase: "validating",
      };
      const error = createMockPayloadError({ tamperDetected: false });

      const result = nfcReducer(validatingState, { type: "ERROR", error });

      expect(result.tamperDetected).toBe(false);
    });

    it("should ignore ERROR from idle phase", () => {
      const error = createMockNfcError();

      const result = nfcReducer(initialNfcState, { type: "ERROR", error });

      expect(result).toBe(initialNfcState);
    });

    it("should ignore ERROR from ready phase", () => {
      const readyState: NfcState = { ...initialNfcState, phase: "ready" };
      const error = createMockNfcError();

      const result = nfcReducer(readyState, { type: "ERROR", error });

      expect(result).toBe(readyState);
    });

    it("should ignore ERROR from success phase", () => {
      const successState: NfcState = { ...initialNfcState, phase: "success" };
      const error = createMockNfcError();

      const result = nfcReducer(successState, { type: "ERROR", error });

      expect(result).toBe(successState);
    });
  });

  describe("CANCEL", () => {
    it("should transition from scanning to idle", () => {
      const scanningState: NfcState = {
        ...initialNfcState,
        phase: "scanning",
      };

      const result = nfcReducer(scanningState, { type: "CANCEL" });

      expect(result).toEqual(initialNfcState);
    });

    it("should transition from classifying to idle", () => {
      const classifyingState: NfcState = {
        ...initialNfcState,
        phase: "classifying",
        rawResult: createMockRawResult(),
      };

      const result = nfcReducer(classifyingState, { type: "CANCEL" });

      expect(result).toEqual(initialNfcState);
    });

    it("should transition from validating to idle", () => {
      const validatingState: NfcState = {
        ...initialNfcState,
        phase: "validating",
        rawResult: createMockRawResult(),
        classification: "valid_payload",
      };

      const result = nfcReducer(validatingState, { type: "CANCEL" });

      expect(result).toEqual(initialNfcState);
    });

    it("should transition from writing to idle", () => {
      const writingState: NfcState = {
        ...initialNfcState,
        phase: "writing",
        payload: createMockPayload(),
      };

      const result = nfcReducer(writingState, { type: "CANCEL" });

      expect(result).toEqual(initialNfcState);
    });

    it("should ignore CANCEL from idle phase", () => {
      const result = nfcReducer(initialNfcState, { type: "CANCEL" });
      expect(result).toBe(initialNfcState);
    });

    it("should ignore CANCEL from ready phase", () => {
      const readyState: NfcState = {
        ...initialNfcState,
        phase: "ready",
        payload: createMockPayload(),
      };

      const result = nfcReducer(readyState, { type: "CANCEL" });
      expect(result).toBe(readyState);
    });

    it("should ignore CANCEL from success phase", () => {
      const successState: NfcState = {
        ...initialNfcState,
        phase: "success",
        payload: createMockPayload(),
      };

      const result = nfcReducer(successState, { type: "CANCEL" });
      expect(result).toBe(successState);
    });

    it("should ignore CANCEL from error phase", () => {
      const errorState: NfcState = {
        ...initialNfcState,
        phase: "error",
        error: createMockNfcError(),
      };

      const result = nfcReducer(errorState, { type: "CANCEL" });
      expect(result).toBe(errorState);
    });

    it("should clear all data when cancelling", () => {
      const writingState: NfcState = {
        ...initialNfcState,
        phase: "writing",
        rawResult: createMockRawResult(),
        payload: createMockPayload(),
        classification: "valid_payload",
        isCheckedIn: true,
      };

      const result = nfcReducer(writingState, { type: "CANCEL" });

      expect(result.rawResult).toBeNull();
      expect(result.payload).toBeNull();
      expect(result.classification).toBeNull();
      expect(result.error).toBeNull();
      expect(result.tamperDetected).toBe(false);
      expect(result.isCheckedIn).toBe(false);
    });
  });

  describe("RESET", () => {
    it("should reset from ready to idle", () => {
      const readyState: NfcState = {
        ...initialNfcState,
        phase: "ready",
        rawResult: createMockRawResult(),
        payload: createMockPayload(),
        classification: "valid_payload",
        isCheckedIn: true,
      };

      const result = nfcReducer(readyState, { type: "RESET" });

      expect(result).toEqual(initialNfcState);
    });

    it("should reset from success to idle", () => {
      const successState: NfcState = {
        ...initialNfcState,
        phase: "success",
        payload: createMockPayload(),
      };

      const result = nfcReducer(successState, { type: "RESET" });

      expect(result).toEqual(initialNfcState);
    });

    it("should reset from error to idle", () => {
      const errorState: NfcState = {
        ...initialNfcState,
        phase: "error",
        error: createMockNfcError(),
        tamperDetected: true,
      };

      const result = nfcReducer(errorState, { type: "RESET" });

      expect(result).toEqual(initialNfcState);
    });

    it("should reset from idle (no-op but still returns initial state)", () => {
      const result = nfcReducer(initialNfcState, { type: "RESET" });

      expect(result).toEqual(initialNfcState);
    });

    it("should reset from any phase including active phases", () => {
      const scanningState: NfcState = {
        ...initialNfcState,
        phase: "scanning",
      };

      const result = nfcReducer(scanningState, { type: "RESET" });

      expect(result).toEqual(initialNfcState);
    });

    it("should clear all stored data on reset", () => {
      const fullState: NfcState = {
        phase: "success",
        rawResult: createMockRawResult(),
        payload: createMockPayload(),
        classification: "valid_payload",
        error: null,
        tamperDetected: false,
        isCheckedIn: true,
      };

      const result = nfcReducer(fullState, { type: "RESET" });

      expect(result.rawResult).toBeNull();
      expect(result.payload).toBeNull();
      expect(result.classification).toBeNull();
      expect(result.error).toBeNull();
      expect(result.tamperDetected).toBe(false);
      expect(result.isCheckedIn).toBe(false);
    });
  });

  describe("full flow: idle → scanning → classifying → validating → ready → writing → success", () => {
    it("should complete the full valid_payload flow", () => {
      let state: NfcState = initialNfcState;

      // idle → scanning
      state = nfcReducer(state, { type: "START_SCAN" });
      expect(state.phase).toBe("scanning");

      // scanning → classifying
      const rawResult = createMockRawResult();
      state = nfcReducer(state, {
        type: "RAW_SCAN_COMPLETE",
        result: rawResult,
      });
      expect(state.phase).toBe("classifying");
      expect(state.rawResult).toBe(rawResult);

      // classifying → validating (valid_payload)
      state = nfcReducer(state, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "valid_payload",
      });
      expect(state.phase).toBe("validating");
      expect(state.classification).toBe("valid_payload");

      // validating → ready
      const payload = createMockPayload();
      state = nfcReducer(state, { type: "VALIDATION_COMPLETE", payload });
      expect(state.phase).toBe("ready");
      expect(state.payload).toBe(payload);

      // ready → writing
      state = nfcReducer(state, { type: "START_WRITE" });
      expect(state.phase).toBe("writing");

      // writing → success
      const updatedPayload = createMockPayload();
      state = nfcReducer(state, {
        type: "WRITE_COMPLETE",
        payload: updatedPayload,
      });
      expect(state.phase).toBe("success");
      expect(state.payload).toBe(updatedPayload);
    });

    it("should complete the non-payload flow (empty card)", () => {
      let state: NfcState = initialNfcState;

      // idle → scanning
      state = nfcReducer(state, { type: "START_SCAN" });
      expect(state.phase).toBe("scanning");

      // scanning → classifying
      const rawResult = createMockRawResult({ classification: "empty" });
      state = nfcReducer(state, {
        type: "RAW_SCAN_COMPLETE",
        result: rawResult,
      });
      expect(state.phase).toBe("classifying");

      // classifying → ready (non-payload skips validating)
      state = nfcReducer(state, {
        type: "CLASSIFICATION_COMPLETE",
        classification: "empty",
      });
      expect(state.phase).toBe("ready");
      expect(state.classification).toBe("empty");
      expect(state.payload).toBeNull();
    });
  });

  describe("unknown action type", () => {
    it("should return the same state for unknown actions", () => {
      const result = nfcReducer(initialNfcState, {
        type: "UNKNOWN_ACTION",
      } as unknown as NfcAction);

      expect(result).toBe(initialNfcState);
    });
  });
});
