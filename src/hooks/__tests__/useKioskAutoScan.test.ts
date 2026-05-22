// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKioskAutoScan } from "../useKioskAutoScan";
import type { NfcCardPhase } from "../nfc/useNfcCard";
import type { SessionGrant } from "../../core/payload/types";

const mockGrant = { sessionKey: new Uint8Array(32), keyVersion: 1 } as SessionGrant;

describe("useKioskAutoScan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial state with hasCompletedCycle=false and isAutoScanning=false", () => {
    const scan = vi.fn();
    const { result } = renderHook(() =>
      useKioskAutoScan({
        enabled: true,
        grant: mockGrant,
        loading: false,
        phase: "idle",
        scan,
      }),
    );

    expect(result.current.hasCompletedCycle).toBe(false);
    expect(result.current.isAutoScanning).toBe(false);
    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT trigger scan on initial mount even when all conditions are met", () => {
    const scan = vi.fn();
    renderHook(() =>
      useKioskAutoScan({
        enabled: true,
        grant: mockGrant,
        loading: false,
        phase: "idle",
        scan,
      }),
    );

    expect(scan).not.toHaveBeenCalled();
  });

  it("sets hasCompletedCycle=true when phase reaches success", () => {
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

    rerender({ phase: "success" });
    expect(result.current.hasCompletedCycle).toBe(true);
  });

  it("sets hasCompletedCycle=true when phase reaches error", () => {
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

    rerender({ phase: "error" });
    expect(result.current.hasCompletedCycle).toBe(true);
  });

  it("auto-invokes scan() when phase transitions to idle after a completed cycle", () => {
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

    // Complete a cycle
    rerender({ phase: "scanning" });
    rerender({ phase: "success" });

    // Transition back to idle
    rerender({ phase: "idle" });

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-invoke scan() if hasCompletedCycle is false", () => {
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
      { initialProps: { phase: "scanning" as NfcCardPhase } },
    );

    // Transition to idle without ever reaching success or error
    rerender({ phase: "idle" });

    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT auto-invoke scan() when enabled is false", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase; enabled: boolean }) =>
        useKioskAutoScan({
          enabled: props.enabled,
          grant: mockGrant,
          loading: false,
          phase: props.phase,
          scan,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase, enabled: true } },
    );

    // Complete a cycle
    rerender({ phase: "success", enabled: true });
    rerender({ phase: "idle", enabled: false });

    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT auto-invoke scan() when grant is null", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase; grant: SessionGrant | null }) =>
        useKioskAutoScan({
          enabled: true,
          grant: props.grant,
          loading: false,
          phase: props.phase,
          scan,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase, grant: mockGrant as SessionGrant | null } },
    );

    // Complete a cycle
    rerender({ phase: "success", grant: mockGrant });
    rerender({ phase: "idle", grant: null });

    expect(scan).not.toHaveBeenCalled();
  });

  it("does NOT auto-invoke scan() when loading is true", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase; loading: boolean }) =>
        useKioskAutoScan({
          enabled: true,
          grant: mockGrant,
          loading: props.loading,
          phase: props.phase,
          scan,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase, loading: false } },
    );

    // Complete a cycle
    rerender({ phase: "success", loading: false });
    rerender({ phase: "idle", loading: true });

    expect(scan).not.toHaveBeenCalled();
  });

  it("respects resetDelay before invoking scan()", () => {
    const scan = vi.fn();
    const { rerender } = renderHook(
      (props: { phase: NfcCardPhase }) =>
        useKioskAutoScan({
          enabled: true,
          grant: mockGrant,
          loading: false,
          phase: props.phase,
          scan,
          resetDelay: 2500,
        }),
      { initialProps: { phase: "idle" as NfcCardPhase } },
    );

    // Complete a cycle
    rerender({ phase: "success" });
    rerender({ phase: "idle" });

    // scan should not be called immediately
    expect(scan).not.toHaveBeenCalled();

    // Advance time by the resetDelay
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger when phase stays idle (no transition)", () => {
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

    // Complete a cycle
    rerender({ phase: "success" });
    rerender({ phase: "idle" });
    expect(scan).toHaveBeenCalledTimes(1);

    // Re-render with idle again (no transition)
    rerender({ phase: "idle" });
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("triggers scan on each idle transition after completed cycles", () => {
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

    // First cycle
    rerender({ phase: "success" });
    rerender({ phase: "idle" });
    expect(scan).toHaveBeenCalledTimes(1);

    // Second cycle
    rerender({ phase: "scanning" });
    rerender({ phase: "error" });
    rerender({ phase: "idle" });
    expect(scan).toHaveBeenCalledTimes(2);
  });
});
