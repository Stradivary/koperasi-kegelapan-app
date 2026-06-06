// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBlockedCheck } from "../useBlockedCheck";
import type { NfcCardPhase } from "../nfc/useNfcCard";
import type { CardPayload } from "#/core/payload/types";

// Mock repositories
vi.mock("#/infrastructure/persistence/dexie/repositories", () => ({
  cardRepo: { getByTenantAndCardId: vi.fn(), filterByCardIdExcludingDeleted: vi.fn() },
  userRepo: { getByTenantAndUserId: vi.fn() },
}));

// Mock checkLocalBlockedStatus
vi.mock("#/core/nfc/localStatusCheck", () => ({
  checkLocalBlockedStatus: vi.fn(),
}));

import { checkLocalBlockedStatus } from "#/core/nfc/localStatusCheck";
const mockCheckStatus = vi.mocked(checkLocalBlockedStatus);

/** Helper to create a minimal payload with a given cardId hex */
function makePayload(cardIdHex: string): CardPayload {
  const bytes = new Uint8Array(cardIdHex.length / 2);
  for (let i = 0; i < cardIdHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cardIdHex.slice(i, i + 2), 16);
  }
  return {
    header: { magic: 0, version: 0, type: 0, cardId: bytes, tenantBind: 0 },
    identity: { name: "", userId: "", gender: 0, status: 0, createdAt: 0 },
    wallet: { balance: 0, lastBalance: 0, counter: 0n, lastTimestamp: 0, state: 0, flags: 0 },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      expiresAt: 0,
      keyVersion: 0,
      rootHash: new Uint8Array(6),
      counterBind: 0,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  } as CardPayload;
}

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

  it("does not run check when payload is null even if phase is ready", () => {
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

  it("runs check when phase transitions to ready and payload is available", async () => {
    mockCheckStatus.mockResolvedValue({ blocked: false, reason: null, notInLocalDb: false });

    const payload = makePayload("aabbcc");

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "ready",
        payload,
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
      "aabbcc",
      expect.objectContaining({ cardRepo: expect.any(Object), userRepo: expect.any(Object) }),
    );
  });

  it("sets isBlocked and blockedReason when card is blocked", async () => {
    mockCheckStatus.mockResolvedValue({
      blocked: true,
      reason: "Kartu diblokir: fraud",
      notInLocalDb: false,
    });

    const payload = makePayload("ddeeff");

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "DD:EE:FF",
        phase: "ready",
        payload,
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

    const payload = makePayload("112233");

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "11:22:33",
        phase: "ready",
        payload,
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

    const payload = makePayload("aabbcc");

    const { result, rerender } = renderHook(
      (props: { phase: NfcCardPhase; payload: CardPayload | null }) =>
        useBlockedCheck({
          tenantId: "t1",
          serialNumber: "AA:BB:CC",
          phase: props.phase,
          payload: props.payload,
        }),
      { initialProps: { phase: "ready" as NfcCardPhase, payload: payload as CardPayload | null } },
    );

    await waitFor(() => {
      expect(result.current.isBlocked).toBe(true);
    });

    // Transition to idle
    rerender({ phase: "idle", payload: null });

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

    const payload = makePayload("aabbcc");

    const { result, rerender } = renderHook(
      (props: { phase: NfcCardPhase; payload: CardPayload | null }) =>
        useBlockedCheck({
          tenantId: "t1",
          serialNumber: "AA:BB:CC",
          phase: props.phase,
          payload: props.payload,
        }),
      {
        initialProps: { phase: "ready" as NfcCardPhase, payload: payload as CardPayload | null },
      },
    );

    expect(result.current.isChecking).toBe(true);

    // Phase changes to idle before the check resolves
    rerender({ phase: "idle", payload: null });

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

    const payload = makePayload("aabbcc");

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "ready",
        payload,
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

    const payload = makePayload("aabbcc");

    const { result } = renderHook(() =>
      useBlockedCheck({
        tenantId: "t1",
        serialNumber: "AA:BB:CC",
        phase: "ready",
        payload,
      }),
    );

    expect(result.current.isChecking).toBe(true);
    expect(result.current.isReady).toBe(false);
  });

  it("discards stale results if cardIdHex changes during in-flight check", async () => {
    const resolvers: Array<
      (value: { blocked: boolean; reason: string | null; notInLocalDb: boolean }) => void
    > = [];
    mockCheckStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const payload1 = makePayload("aabbcc");
    const payload2 = makePayload("ddeeff");

    const { result, rerender } = renderHook(
      (props: { payload: CardPayload }) =>
        useBlockedCheck({
          tenantId: "t1",
          serialNumber: "AA:BB:CC",
          phase: "ready",
          payload: props.payload,
        }),
      { initialProps: { payload: payload1 } },
    );

    expect(result.current.isChecking).toBe(true);
    expect(resolvers.length).toBe(1);

    // Payload changes (new card scanned) before the check resolves
    rerender({ payload: payload2 });

    // A second check should have been initiated for the new cardId
    expect(resolvers.length).toBe(2);

    // Resolve the FIRST (stale) check
    await act(async () => {
      resolvers[0]({ blocked: true, reason: "Old card blocked", notInLocalDb: false });
      await new Promise((r) => setTimeout(r, 10));
    });

    // The stale result should be discarded
    expect(result.current.blockedReason).not.toBe("Old card blocked");
    // Still checking because the second check hasn't resolved
    expect(result.current.isChecking).toBe(true);

    // Resolve the second check
    await act(async () => {
      resolvers[1]({ blocked: false, reason: null, notInLocalDb: false });
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.isBlocked).toBe(false);
  });
});
