// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNotifyMutation = vi.fn();
vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => ({ notifyMutation: mockNotifyMutation }),
}));

const mockCardsGet = vi.fn();
const mockCardsUpdate = vi.fn();
const mockCardsPut = vi.fn();
vi.mock("#/presentation/hooks/useLocalDb", () => ({
  localDb: {
    cards: {
      get: (...args: unknown[]) => mockCardsGet(...args),
      update: (...args: unknown[]) => mockCardsUpdate(...args),
      put: (...args: unknown[]) => mockCardsPut(...args),
    },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockCardsGet.mockResolvedValue(undefined);
  mockCardsUpdate.mockResolvedValue(undefined);
  mockCardsPut.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCardSync", () => {
  const mockPayload = {
    header: { magic: 0x4b4f5057, version: 4, type: 0, cardId: new Uint8Array(6), tenantBind: 0 },
    wallet: {
      balance: 5000,
      counter: 3n,
      lastBalance: 0,
      lastTimestamp: 1700000000,
      state: 0,
      flags: 0,
    },
    identity: { name: "Test", createdAt: 1700000000, userId: "", gender: 0, status: 0 },
    session: { startTime: 0, endTime: 0, terminalId: 0 },
    logEntries: [],
    trailer: {
      keyVersion: 1,
      expiresAt: 9_999_999_999,
      rootHash: new Uint8Array(6),
      counterBind: 3,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };

  it("does nothing when state phase is idle", async () => {
    const { useCardSync } = await import("../useCardSync");
    const onResetState = vi.fn();
    const onCloseDrawers = vi.fn();

    renderHook(
      () =>
        useCardSync({
          tenantId: "t-1",
          state: {
            phase: "idle",
            payload: null,
            serialNumber: null,
            error: null,
            tamperDetected: false,
            warning: null,
          },
          resetCardPending: false,
          onResetState,
          onCloseDrawers,
        }),
      { wrapper: createWrapper() },
    );

    expect(mockCardsGet).not.toHaveBeenCalled();
    expect(mockNotifyMutation).not.toHaveBeenCalled();
  });

  describe("success phase - auto-close and sync", () => {
    it("updates existing card balance and counter on success", async () => {
      mockCardsGet.mockResolvedValue({ tenantId: "t-1", cardId: "aabbcc" });
      const { useCardSync } = await import("../useCardSync");
      const onResetState = vi.fn();
      const onCloseDrawers = vi.fn();

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "success",
              payload: mockPayload,
              serialNumber: "AA:BB:CC",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState,
            onCloseDrawers,
          }),
        { wrapper: createWrapper() },
      );

      // Wait for the async operations
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockCardsGet).toHaveBeenCalledWith(["t-1", "aabbcc"]);
      expect(mockCardsUpdate).toHaveBeenCalledWith(
        ["t-1", "aabbcc"],
        expect.objectContaining({
          balance: 5000,
          counter: 3,
        }),
      );
    });

    it("sets status to active when resetCardPending is true", async () => {
      mockCardsGet.mockResolvedValue({ tenantId: "t-1", cardId: "aabbcc" });
      const { useCardSync } = await import("../useCardSync");
      const onResetState = vi.fn();
      const onCloseDrawers = vi.fn();

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "success",
              payload: mockPayload,
              serialNumber: "AA:BB:CC",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: true,
            onResetState,
            onCloseDrawers,
          }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockCardsUpdate).toHaveBeenCalledWith(
        ["t-1", "aabbcc"],
        expect.objectContaining({ status: "active" }),
      );
    });

    it("calls onResetState and onCloseDrawers after delay", async () => {
      mockCardsGet.mockResolvedValue({ tenantId: "t-1", cardId: "aabbcc" });
      const { useCardSync } = await import("../useCardSync");
      const onResetState = vi.fn();
      const onCloseDrawers = vi.fn();

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "success",
              payload: mockPayload,
              serialNumber: "AA:BB:CC",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState,
            onCloseDrawers,
          }),
        { wrapper: createWrapper() },
      );

      expect(onResetState).not.toHaveBeenCalled();
      expect(onCloseDrawers).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(onResetState).toHaveBeenCalled();
      expect(onCloseDrawers).toHaveBeenCalled();
    });

    it("notifies mutation on success", async () => {
      mockCardsGet.mockResolvedValue(null);
      const { useCardSync } = await import("../useCardSync");

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "success",
              payload: mockPayload,
              serialNumber: "AA:BB:CC",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState: vi.fn(),
            onCloseDrawers: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );

      expect(mockNotifyMutation).toHaveBeenCalled();
    });

    it("does nothing when serialNumber is null", async () => {
      const { useCardSync } = await import("../useCardSync");

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "success",
              payload: mockPayload,
              serialNumber: null,
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState: vi.fn(),
            onCloseDrawers: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );

      expect(mockCardsGet).not.toHaveBeenCalled();
    });
  });

  describe("ready phase - auto-sync card data", () => {
    it("updates existing card when scanned", async () => {
      mockCardsGet.mockResolvedValue({ tenantId: "t-1", cardId: "aabbcc" });
      const { useCardSync } = await import("../useCardSync");

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "ready",
              payload: mockPayload,
              serialNumber: "AA:BB:CC",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState: vi.fn(),
            onCloseDrawers: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockCardsUpdate).toHaveBeenCalledWith(
        ["t-1", "aabbcc"],
        expect.objectContaining({
          balance: 5000,
          counter: 3,
          syncStatus: "pending",
        }),
      );
    });

    it("creates new card record when not existing", async () => {
      mockCardsGet.mockResolvedValue(undefined);
      const { useCardSync } = await import("../useCardSync");

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "ready",
              payload: mockPayload,
              serialNumber: "DD:EE:FF",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState: vi.fn(),
            onCloseDrawers: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockCardsPut).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t-1",
          cardId: "ddeeff",
          userId: null,
          status: "active",
          balance: 5000,
          counter: 3,
          keyVersion: 1,
          syncStatus: "pending",
        }),
      );
    });

    it("sets expiresAt to null when trailer.expiresAt is max value", async () => {
      mockCardsGet.mockResolvedValue(undefined);
      const { useCardSync } = await import("../useCardSync");

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "ready",
              payload: mockPayload,
              serialNumber: "11:22:33",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState: vi.fn(),
            onCloseDrawers: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockCardsPut).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
    });

    it("sets expiresAt when trailer value is not max", async () => {
      mockCardsGet.mockResolvedValue(undefined);
      const { useCardSync } = await import("../useCardSync");

      const payloadWithExpiry = {
        ...mockPayload,
        trailer: { ...mockPayload.trailer, expiresAt: 1700000000 },
      };

      renderHook(
        () =>
          useCardSync({
            tenantId: "t-1",
            state: {
              phase: "ready",
              payload: payloadWithExpiry,
              serialNumber: "44:55:66",
              error: null,
              tamperDetected: false,
              warning: null,
            },
            resetCardPending: false,
            onResetState: vi.fn(),
            onCloseDrawers: vi.fn(),
          }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockCardsPut).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: 1700000000 }));
    });
  });
});
