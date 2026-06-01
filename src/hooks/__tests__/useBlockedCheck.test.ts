// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBlockedCheck } from "../useBlockedCheck";
import type { NfcCardPhase } from "../nfc/useNfcCard";

// Mock repositories
vi.mock("#/lib/repositories", () => ({
  cardRepo: { getByTenantAndCardId: vi.fn(), filterByCardIdExcludingDeleted: vi.fn() },
  userRepo: { getByTenantAndUserId: vi.fn() },
}));

// Mock checkLocalBlockedStatus
vi.mock("#/core/nfc/localStatusCheck", () => ({
  checkLocalBlockedStatus: vi.fn(),
}));

import { checkLocalBlockedStatus } from "#/core/nfc/localStatusCheck";
const mockCheckStatus = vi.mocked(checkLocalBlockedStatus);

describe("useBlockedCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initial state when phase is idle", () => {
    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: null,
        phase: "idle",
        payload: null,
      }),
    );

    expect(result.current).toEqual({
      isChecking: false,
      isBlocked: false,
      blockedReason: null,
      notInLocalDb: false,
      isReady: false,
    });
  });

  it("does not run check when phase is not ready", () => {
    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "scanning",
        payload: null,
      }),
    );

    expect(mockCheckStatus).not.toHaveBeenCalled();
    expect(result.current.isChecking).toBe(false);
  });

  it("does not run check when serialNumber is null even if phase is ready", () => {
    renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: null,
        phase: "ready",
        payload: null,
      }),
    );

    expect(mockCheckStatus).not.toHaveBeenCalled();
  });

  it("runs check when phase transitions to ready and serialNumber is non-null", async () => {
    mockCheckStatus.mockResolvedValue({ blocked: false, reason: null, notInLocalDb: false });

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "ready",
        payload: null,
      }),
    );

    // Should be checking initially
    expect(result.current.isChecking).toBe(true);
    expect(result.current.isReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isBlocked).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.notInLocalDb).toBe(false);
    expect(mockCheckStatus).toHaveBeenCalledWith(
      "t1",
      "AA:BB:CC",
      expect.objectContaining({ cardRepo: expect.any(Object), userRepo: expect.any(Object) }),
    );
  });

  it("sets isBlocked and blockedReason when card is blocked", async () => {
    mockCheckStatus.mockResolvedValue({
      blocked: true,
      reason: "Kartu diblokir: fraud",
      notInLocalDb: false,
    });

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "DD:EE:FF",
        phase: "ready",
        payload: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isBlocked).toBe(true);
    expect(result.current.blockedReason).toBe("Kartu diblokir: fraud");
    expect(result.current.isReady).toBe(false);
  });

  it("sets notInLocalDb when card is not found in local DB", async () => {
    mockCheckStatus.mockResolvedValue({ blocked: false, reason: null, notInLocalDb: true });

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "11:22:33",
        phase: "ready",
        payload: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isBlocked).toBe(false);
    expect(result.current.notInLocalDb).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it("resets all state when phase transitions to idle", async () => {
    mockCheckStatus.mockResolvedValue({
      blocked: true,
      reason: "Blocked",
      notInLocalDb: false,
    });

    const { result, rerender } = renderHook(
      (props: { phase: NfcCardPhase }) =>
        useBlockedCheck({
          tenantId: "t1",
          serialNumber: "AA:BB:CC",
          phase: props.phase,
          payload: null,
        }),
      { initialProps: { phase: "ready" as NfcCardPhase } },
    );

    await waitFor(() => {
      expect(result.current.isBlocked).toBe(true);
    });

    // Transition to idle
    rerender({ phase: "idle" });

    expect(result.current).toEqual({
      isChecking: false,
      isBlocked: false,
      blockedReason: null,
      notInLocalDb: false,
      isReady: false,
    });
  });

  it("discards stale results if phase changes during in-flight check", async () => {
    // Create a delayed promise that we can control
    let resolveCheck: (value: {
      blocked: boolean;
      reason: string | null;
      notInLocalDb: boolean;
    }) => void;
    mockCheckStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      (props: { phase: NfcCardPhase; serialNumber: string | null }) =>
        useBlockedCheck({
          tenantId: "t1",
          serialNumber: props.serialNumber,
          phase: props.phase,
          payload: null,
        }),
      {
        initialProps: { phase: "ready" as NfcCardPhase, serialNumber: "AA:BB:CC" as string | null },
      },
    );

    expect(result.current.isChecking).toBe(true);

    // Phase changes to idle before the check resolves
    rerender({ phase: "idle", serialNumber: null });

    // Now resolve the stale check
    await act(async () => {
      resolveCheck!({ blocked: true, reason: "Stale result", notInLocalDb: false });
      await new Promise((r) => setTimeout(r, 10));
    });

    // The stale result should be discarded - state should be reset (idle)
    expect(result.current.isBlocked).toBe(false);
    expect(result.current.blockedReason).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it("treats IndexedDB read error as not blocked with notInLocalDb: true", async () => {
    mockCheckStatus.mockRejectedValue(new Error("IndexedDB read error"));

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "ready",
        payload: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isBlocked).toBe(false);
    expect(result.current.notInLocalDb).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it("isReady is false when phase is ready but check is still in progress", () => {
    mockCheckStatus.mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "ready",
        payload: null,
      }),
    );

    expect(result.current.isChecking).toBe(true);
    expect(result.current.isReady).toBe(false);
  });

  it("discards stale results if serialNumber changes during in-flight check", async () => {
    const resolvers: Array<
      (value: { blocked: boolean; reason: string | null; notInLocalDb: boolean }) => void
    > = [];
    mockCheckStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { result, rerender } = renderHook(
      (props: { serialNumber: string | null }) =>
        useBlockedCheck({
          tenantId: "t1",
          serialNumber: props.serialNumber,
          phase: "ready",
          payload: null,
        }),
      { initialProps: { serialNumber: "AA:BB:CC" as string | null } },
    );

    expect(result.current.isChecking).toBe(true);
    expect(resolvers.length).toBe(1);

    // SerialNumber changes (new card scanned) before the check resolves
    rerender({ serialNumber: "DD:EE:FF" });

    // A second check should have been initiated for the new serial
    expect(resolvers.length).toBe(2);

    // Resolve the FIRST (stale) check for "AA:BB:CC"
    await act(async () => {
      resolvers[0]({ blocked: true, reason: "Old card blocked", notInLocalDb: false });
      await new Promise((r) => setTimeout(r, 10));
    });

    // The stale result for "AA:BB:CC" should be discarded
    expect(result.current.blockedReason).not.toBe("Old card blocked");
    // Still checking because the second check hasn't resolved
    expect(result.current.isChecking).toBe(true);

    // Resolve the second check for "DD:EE:FF"
    await act(async () => {
      resolvers[1]({ blocked: false, reason: null, notInLocalDb: false });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.isBlocked).toBe(false);
  });
});
