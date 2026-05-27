// @vitest-environment jsdom
/**
 * Additional tests for useKioskAutoScan.ts covering uncovered lines:
 * - Lines 68-72: autoStart triggers first scan when conditions are met
 * - Lines 100-101: resetDelay cleanup (clearTimeout + setIsAutoScanning(false))
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKioskAutoScan } from "../useKioskAutoScan";
import type { NfcCardPhase } from "../nfc/useNfcCard";
import type { SessionGrant } from "#/core/payload/types";

const mockGrant = { sessionKey: new Uint8Array(32), keyVersion: 1 } as SessionGrant;

describe("useKioskAutoScan — autoStart (lines 68-72)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers scan immediately on mount when autoStart=true and conditions are met", () => {
    const scan = vi.fn();
    renderHook(() =>
      useKioskAutoScan({
        enabled: true,
        grant: mockGrant,
        loading: false,
        phase: "idle",
        scan,
        autoStart: true,
      }),
    );

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger autoStart when enabled=false", () => {
    const scan = vi.fn();
    renderHook(() =>
      useKioskAutoScan({
        enabled: false,
        grant: mockGrant,
        loading: false,
        phase: "idle",
        scan,
        autoStart: true,
      }),
    );

    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT trigger autoStart when grant is null", () => {
    const scan = vi.fn();
    renderHook(() =>
      useKioskAutoScan({
        enabled: true,
        grant: null,
        loading: false,
        phase: "idle",
        scan,
        autoStart: true,
      }),
    );

    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT trigger autoStart when loading=true", () => {
    const scan = vi.fn();
    renderHook(() =>
      useKioskAutoScan({
        enabled: true,
        grant: mockGrant,
        loading: true,
        phase: "idle",
        scan,
        autoStart: true,
      }),
    );

    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT trigger autoStart when phase is not idle", () => {
    const scan = vi.fn();
    renderHook(() =>
      useKioskAutoScan({
        enabled: true,
        grant: mockGrant,
        loading: false,
        phase: "scanning" as NfcCardPhase,
        scan,
        autoStart: true,
      }),
    );

    expect(scan).not.toHaveBeenCalled();
  });

  it("only triggers autoStart once even if re-rendered", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase }) =>
        useKioskAutoScan({
          enabled: true,
          grant: mockGrant,
          loading: false,
          phase: props.phase,
          scan,
          autoStart: true,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase } },
    );

    expect(scan).toHaveBeenCalledTimes(1);

    // Re-render with same props — should not trigger again
    rerender({ phase: "idle" });
    expect(scan).toHaveBeenCalledTimes(1);
  });
});

describe("useKioskAutoScan — ready phase completes cycle (line 100-101)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets hasCompletedCycle=true when phase reaches ready", () => {
    const scan = vi.fn();
    const { result, rerender } = renderHook(
      (props: { phase: NfcCardPhase }) =>
        useKioskAutoScan({
          enabled: true,
          grant: mockGrant,
          loading: false,
          phase: props.phase,
          scan,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase } },
    );

    expect(result.current.hasCompletedCycle).toBe(false);
    rerender({ phase: "ready" });
    expect(result.current.hasCompletedCycle).toBe(true);
  });

  it("auto-scans after ready → idle transition", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase }) =>
        useKioskAutoScan({
          enabled: true,
          grant: mockGrant,
          loading: false,
          phase: props.phase,
          scan,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase } },
    );

    rerender({ phase: "ready" });
    rerender({ phase: "idle" });

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("cleans up resetDelay timer when phase changes before delay fires (lines 100-101)", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase }) =>
        useKioskAutoScan({
          enabled: true,
          grant: mockGrant,
          loading: false,
          phase: props.phase,
          scan,
          resetDelay: 2000,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase } },
    );

    // Complete a cycle
    rerender({ phase: "success" });
    // Transition to idle — starts the resetDelay timer
    rerender({ phase: "idle" });

    // Before delay fires, change phase to scanning (triggers cleanup)
    rerender({ phase: "scanning" });

    // Advance past the delay — scan should NOT have been called
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(scan).not.toHaveBeenCalled();
  });
});
