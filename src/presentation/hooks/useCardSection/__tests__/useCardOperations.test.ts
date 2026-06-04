// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNotifyMutation = vi.fn();
vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => ({ notifyMutation: mockNotifyMutation }),
}));

const mockApplyResetState = vi.fn();
const mockApplyTopup = vi.fn();
const mockCheckLocalBlockedStatus = vi.fn();
const mockValidateTopup = vi.fn();
vi.mock("#/presentation/hooks/domain", () => ({
  applyResetState: (...args: unknown[]) => mockApplyResetState(...args),
  applyTopup: (...args: unknown[]) => mockApplyTopup(...args),
  checkLocalBlockedStatus: (...args: unknown[]) => mockCheckLocalBlockedStatus(...args),
  validateTopup: (...args: unknown[]) => mockValidateTopup(...args),
}));

const mockScan = vi.fn();
const mockWrite = vi.fn();
const mockReset = vi.fn();
const mockCancel = vi.fn();
const mockRetryScan = vi.fn();
const mockNfcState = {
  phase: "idle" as string,
  payload: null as unknown,
  serialNumber: null as string | null,
  error: null,
  tamperDetected: false,
  warning: null,
};

vi.mock("#/presentation/hooks/nfc", () => ({
  useNfcCard: () => ({
    state: mockNfcState,
    scan: mockScan,
    write: mockWrite,
    reset: mockReset,
    cancel: mockCancel,
    retryScan: mockRetryScan,
  }),
}));

const mockCardsUpdate = vi.fn();
const mockCardsGet = vi.fn();
const mockCardsPut = vi.fn();
vi.mock("#/presentation/hooks/useLocalDb", () => ({
  localDb: {
    cards: {
      update: (...args: unknown[]) => mockCardsUpdate(...args),
      get: (...args: unknown[]) => mockCardsGet(...args),
      put: (...args: unknown[]) => mockCardsPut(...args),
    },
  },
}));

vi.mock("#/presentation/hooks/useRepositories", () => ({
  cardRepo: {},
  userRepo: {},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const defaultOptions = {
  tenantId: "t-1",
  grant: {
    keyVersion: 1,
    key: new Uint8Array(16),
    role: "admin" as const,
    sessionKey: new Uint8Array(16),
    expiresAt: 0,
    allowedOps: [""],
    signature: new Uint8Array(16),
    tenantId: "",
    accountId: "",
    deviceId: "",
  },
  terminalId: 1,
  onOpenTopupDrawer: vi.fn(),
  onCloseDrawer: vi.fn(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockNfcState.phase = "idle";
  mockNfcState.payload = null;
  mockNfcState.serialNumber = null;
  mockCardsUpdate.mockResolvedValue(undefined);
  mockCardsGet.mockResolvedValue(undefined);
  mockCardsPut.mockResolvedValue(undefined);
  mockCheckLocalBlockedStatus.mockResolvedValue({ blocked: false });
  mockValidateTopup.mockReturnValue({ valid: true });
  mockApplyTopup.mockReturnValue({ wallet: { balance: 100 } });
  mockApplyResetState.mockReturnValue({ wallet: { balance: 0 } });
  mockWrite.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCardOperations", () => {
  it("returns initial state with nfc in idle phase", async () => {
    const { useCardOperations } = await import("../useCardOperations");
    const { result } = renderHook(() => useCardOperations(defaultOptions), {
      wrapper: createWrapper(),
    });

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.resetCardPending).toBe(false);
  });

  it("exposes scan, reset, cancel, retryScan from nfc hook", async () => {
    const { useCardOperations } = await import("../useCardOperations");
    const { result } = renderHook(() => useCardOperations(defaultOptions), {
      wrapper: createWrapper(),
    });

    expect(result.current.scan).toBe(mockScan);
    expect(result.current.reset).toBe(mockReset);
    expect(result.current.cancel).toBe(mockCancel);
    expect(result.current.retryScan).toBe(mockRetryScan);
  });

  describe("deleteCard", () => {
    it("marks card as deleted in local DB", async () => {
      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.deleteCard.mutateAsync({
          card: { cardId: "c-1" } as any,
        });
      });

      expect(mockCardsUpdate).toHaveBeenCalledWith(
        ["t-1", "c-1"],
        expect.objectContaining({
          status: "deleted",
          syncStatus: "pending",
        }),
      );
    });

    it("notifies mutation after deletion", async () => {
      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.deleteCard.mutateAsync({
          card: { cardId: "c-1" } as any,
        });
      });

      expect(mockNotifyMutation).toHaveBeenCalled();
    });
  });

  describe("fixCard", () => {
    it("updates existing card in local DB", async () => {
      mockCardsGet.mockResolvedValue({ tenantId: "t-1", cardId: "c-1" });
      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.fixCard.mutateAsync({
          cardId: "c-1",
          userId: "u-1",
          balance: 5000,
          expiresAt: null,
        });
      });

      expect(mockCardsUpdate).toHaveBeenCalledWith(
        ["t-1", "c-1"],
        expect.objectContaining({
          userId: "u-1",
          status: "active",
          balance: 5000,
          syncStatus: "pending",
        }),
      );
    });

    it("creates new card when not existing in local DB", async () => {
      mockCardsGet.mockResolvedValue(undefined);
      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.fixCard.mutateAsync({
          cardId: "c-new",
          userId: "u-1",
          balance: 10000,
          expiresAt: 9999999999,
        });
      });

      expect(mockCardsPut).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          cardId: "c-new",
          userId: "u-1",
          status: "active",
          balance: 10000,
          expiresAt: 9999999999,
          syncStatus: "pending",
        }),
      );
    });
  });

  describe("handleTopupCard", () => {
    it("opens topup drawer and initiates scan", async () => {
      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.handleTopupCard("c-1");
      });

      expect(defaultOptions.onOpenTopupDrawer).toHaveBeenCalledWith("c-1");
      expect(mockScan).toHaveBeenCalled();
    });
  });

  describe("handleTopupConfirm", () => {
    it("validates and writes topup to card", async () => {
      mockNfcState.phase = "ready";
      mockNfcState.payload = { wallet: { balance: 50 } };

      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleTopupConfirm(10000);
      });

      expect(mockValidateTopup).toHaveBeenCalledWith({ wallet: { balance: 50 } }, 10000);
      expect(mockApplyTopup).toHaveBeenCalled();
      expect(mockWrite).toHaveBeenCalled();
    });

    it("does nothing when payload is null", async () => {
      mockNfcState.phase = "idle";
      mockNfcState.payload = null;

      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleTopupConfirm(10000);
      });

      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  describe("handleResetWrite", () => {
    it("applies reset state and writes to card", async () => {
      mockNfcState.phase = "ready";
      mockNfcState.payload = { wallet: { balance: 100, state: 1 } };

      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleResetWrite();
      });

      expect(mockApplyResetState).toHaveBeenCalledWith(
        { wallet: { balance: 100, state: 1 } },
        expect.any(Number),
      );
      expect(mockWrite).toHaveBeenCalledWith(
        mockApplyResetState.mock.results[0]?.value,
        "admin_reset",
      );
    });

    it("does nothing when payload is null", async () => {
      mockNfcState.payload = null;

      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleResetWrite();
      });

      expect(mockApplyResetState).not.toHaveBeenCalled();
    });
  });

  describe("setResetCardPending", () => {
    it("toggles reset card pending state", async () => {
      const { useCardOperations } = await import("../useCardOperations");
      const { result } = renderHook(() => useCardOperations(defaultOptions), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setResetCardPending(true);
      });
      expect(result.current.resetCardPending).toBe(true);

      act(() => {
        result.current.setResetCardPending(false);
      });
      expect(result.current.resetCardPending).toBe(false);
    });
  });
});
