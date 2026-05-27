/**
 * Property-Based Tests for Write Progress Feedback
 *
 * **Validates: Requirements 4.3**
 *
 * Property 7: Write Progress Feedback
 *
 * For any write operation, the state SHALL transition through phases in order:
 * "preparing" → "waiting" → "writing" → "complete" (or "error" on failure).
 *
 * @module core/nfc/__tests__/properties/writeProgress.property.test
 */

import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { MockNfcAdapter } from "../../adapters/mockNfcAdapter";
import { GenericNfcLayer } from "../../genericNfcLayer";
import type { WritePhase } from "../../types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid write phases in the expected order.
 */
const VALID_WRITE_PHASES: WritePhase[] = ["preparing", "waiting", "writing", "complete"];

/**
 * Expected phase order for successful writes.
 */
const EXPECTED_SUCCESS_ORDER: WritePhase[] = ["preparing", "waiting", "writing", "complete"];

/**
 * Expected phase order for failed writes (error occurs during writing phase).
 */
const EXPECTED_ERROR_ORDER: WritePhase[] = ["preparing", "waiting", "writing"];

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generates arbitrary data to write to NFC tag.
 * Constrained to reasonable sizes for NFC tags.
 */
const arbitraryWriteData: fc.Arbitrary<Uint8Array> = fc.uint8Array({
  minLength: 1,
  maxLength: 500,
});

/**
 * Generates arbitrary text to write to NFC tag.
 */
const arbitraryWriteText: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 200,
});

/**
 * Generates arbitrary error messages for failed writes.
 */
const arbitraryErrorMessage: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 100,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a GenericNfcLayer with a mock adapter and phase tracking.
 */
function createLayerWithPhaseTracking(
  mockAdapter: MockNfcAdapter,
  phaseTracker: WritePhase[],
): GenericNfcLayer {
  return new GenericNfcLayer({
    adapter: mockAdapter,
    onWriteProgress: (phase: WritePhase) => {
      phaseTracker.push(phase);
    },
    onError: vi.fn(),
  });
}

/**
 * Validates that phases occur in the expected order without skipping.
 */
function validatePhaseOrder(recordedPhases: WritePhase[], expectedOrder: WritePhase[]): boolean {
  if (recordedPhases.length !== expectedOrder.length) {
    return false;
  }

  for (let i = 0; i < recordedPhases.length; i++) {
    if (recordedPhases[i] !== expectedOrder[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that no phases are skipped in the recorded sequence.
 * Each phase must be followed by the next phase in the valid order.
 */
function validateNoSkippedPhases(recordedPhases: WritePhase[]): boolean {
  for (let i = 0; i < recordedPhases.length - 1; i++) {
    const currentPhaseIndex = VALID_WRITE_PHASES.indexOf(recordedPhases[i]);
    const nextPhaseIndex = VALID_WRITE_PHASES.indexOf(recordedPhases[i + 1]);

    // Next phase should be exactly one step after current phase
    if (nextPhaseIndex !== currentPhaseIndex + 1) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that phases don't occur out of order.
 */
function validateNoOutOfOrderPhases(recordedPhases: WritePhase[]): boolean {
  let lastPhaseIndex = -1;

  for (const phase of recordedPhases) {
    const currentPhaseIndex = VALID_WRITE_PHASES.indexOf(phase);

    // Phase index should always increase
    if (currentPhaseIndex <= lastPhaseIndex) {
      return false;
    }

    lastPhaseIndex = currentPhaseIndex;
  }

  return true;
}

// ============================================================================
// Property Tests
// ============================================================================

describe("Write Progress Feedback Property Tests", () => {
  describe("Property 7: Write Progress Feedback", () => {
    /**
     * **Validates: Requirement 4.3**
     *
     * For any successful write operation, phases SHALL occur in order:
     * "preparing" → "waiting" → "writing" → "complete"
     */
    it("should transition through all phases in order for successful writes", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, async (data) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeRaw(data);

          // Verify
          expect(validatePhaseOrder(phaseTracker, EXPECTED_SUCCESS_ORDER)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * For any failed write operation, phases SHALL occur in order:
     * "preparing" → "waiting" → "writing" → (error callback fired)
     */
    it("should transition through phases until error for failed writes", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, arbitraryErrorMessage, async (data, errorMessage) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const errorCallback = vi.fn();
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [
              {
                success: false,
                error: { code: "WRITE_FAILED", message: errorMessage },
              },
            ],
          });
          const layer = new GenericNfcLayer({
            adapter: mockAdapter,
            onWriteProgress: (phase: WritePhase) => {
              phaseTracker.push(phase);
            },
            onError: errorCallback,
          });

          // Execute - expect error to be thrown
          try {
            await layer.writeRaw(data);
          } catch {
            // Expected to throw
          }

          // Verify phases occurred in order up to the error
          expect(validatePhaseOrder(phaseTracker, EXPECTED_ERROR_ORDER)).toBe(true);

          // Verify error callback was fired
          expect(errorCallback).toHaveBeenCalled();
          expect(errorCallback.mock.calls[0][0].code).toBe("WRITE_FAILED");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * No phases SHALL be skipped during write operations.
     */
    it("should not skip any phases during successful writes", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, async (data) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeRaw(data);

          // Verify no phases were skipped
          expect(validateNoSkippedPhases(phaseTracker)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * Phases SHALL NOT occur out of order during write operations.
     */
    it("should not have phases occur out of order", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, async (data) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeRaw(data);

          // Verify phases are in order
          expect(validateNoOutOfOrderPhases(phaseTracker)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * For any successful write using writeText, phases SHALL occur in order:
     * "preparing" → "waiting" → "writing" → "complete"
     */
    it("should transition through all phases in order for writeText operations", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteText, async (text) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeText(text);

          // Verify
          expect(validatePhaseOrder(phaseTracker, EXPECTED_SUCCESS_ORDER)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * The first phase SHALL always be "preparing".
     */
    it("should always start with 'preparing' phase", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, async (data) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeRaw(data);

          // Verify first phase is "preparing"
          expect(phaseTracker.length).toBeGreaterThan(0);
          expect(phaseTracker[0]).toBe("preparing");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * For successful writes, the last phase SHALL always be "complete".
     */
    it("should always end with 'complete' phase for successful writes", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, async (data) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeRaw(data);

          // Verify last phase is "complete"
          expect(phaseTracker.length).toBeGreaterThan(0);
          expect(phaseTracker.at(-1)).toBe("complete");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * **Validates: Requirement 4.3**
     *
     * Each phase SHALL occur exactly once during a write operation.
     */
    it("should have each phase occur exactly once for successful writes", async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryWriteData, async (data) => {
          // Setup
          const phaseTracker: WritePhase[] = [];
          const mockAdapter = new MockNfcAdapter({
            writeResponses: [{ success: true }],
          });
          const layer = createLayerWithPhaseTracking(mockAdapter, phaseTracker);

          // Execute
          await layer.writeRaw(data);

          // Verify each phase occurs exactly once
          const phaseCounts = new Map<WritePhase, number>();
          for (const phase of phaseTracker) {
            phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
          }

          for (const expectedPhase of EXPECTED_SUCCESS_ORDER) {
            expect(phaseCounts.get(expectedPhase)).toBe(1);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
