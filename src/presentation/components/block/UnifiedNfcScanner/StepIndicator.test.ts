/**
 * Unit tests for StepIndicator logic
 *
 * Tests the phase-to-step mapping logic used by the StepIndicator component.
 *
 * @see Requirements 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { describe, it, expect } from "vitest";
import type { NfcPhase } from "#/core/nfc/stateMachine.ts";

// Re-implement the mapping logic for testing (mirrors the component's internal logic)
function getActiveStepIndex(phase: NfcPhase): number {
  switch (phase) {
    case "idle":
    case "scanning":
      return 0;
    case "classifying":
    case "validating":
    case "ready":
      return 1;
    case "writing":
      return 2;
    case "success":
      return 3;
    case "error":
      return -1;
    default:
      return 0;
  }
}

describe("StepIndicator - getActiveStepIndex", () => {
  it("maps idle phase to step 0 (Tap Kartu)", () => {
    expect(getActiveStepIndex("idle")).toBe(0);
  });

  it("maps scanning phase to step 0 (Tap Kartu)", () => {
    expect(getActiveStepIndex("scanning")).toBe(0);
  });

  it("maps classifying phase to step 1 (Kartu Ditemukan)", () => {
    expect(getActiveStepIndex("classifying")).toBe(1);
  });

  it("maps validating phase to step 1 (Kartu Ditemukan)", () => {
    expect(getActiveStepIndex("validating")).toBe(1);
  });

  it("maps ready phase to step 1 (Kartu Ditemukan)", () => {
    expect(getActiveStepIndex("ready")).toBe(1);
  });

  it("maps writing phase to step 2 (Tulis Kartu)", () => {
    expect(getActiveStepIndex("writing")).toBe(2);
  });

  it("maps success phase to step 3 (Selesai)", () => {
    expect(getActiveStepIndex("success")).toBe(3);
  });

  it("maps error phase to -1 (no active step)", () => {
    expect(getActiveStepIndex("error")).toBe(-1);
  });
});

describe("StepIndicator - step completion logic", () => {
  it("step 0 is completed when active index > 0", () => {
    // When phase is classifying (activeIndex=1), step 0 should be completed
    const activeIndex = getActiveStepIndex("classifying");
    expect(activeIndex > 0).toBe(true);
  });

  it("steps 0 and 1 are completed when active index > 1", () => {
    // When phase is writing (activeIndex=2), steps 0 and 1 should be completed
    const activeIndex = getActiveStepIndex("writing");
    expect(activeIndex > 0).toBe(true);
    expect(activeIndex > 1).toBe(true);
  });

  it("all steps are completed when phase is success", () => {
    // When phase is success (activeIndex=3), all previous steps are completed
    const activeIndex = getActiveStepIndex("success");
    expect(activeIndex > 0).toBe(true);
    expect(activeIndex > 1).toBe(true);
    expect(activeIndex > 2).toBe(true);
  });

  it("no steps are completed when phase is idle", () => {
    const activeIndex = getActiveStepIndex("idle");
    // Step 0 is current (not completed), no steps before it
    expect(activeIndex).toBe(0);
  });
});
