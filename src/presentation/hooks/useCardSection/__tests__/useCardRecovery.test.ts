// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockIsNfcSupported = vi.fn();
vi.mock("#/presentation/hooks/domain", () => ({
  isNfcSupported: () => mockIsNfcSupported(),
}));

vi.mock("#/presentation/hooks/types", () => ({}));

const mockExecuteRecovery = vi.fn();
vi.mock("#/presentation/components/section/CardSection.utils", () => ({
  executeRecovery: (...args: unknown[]) => mockExecuteRecovery(...args),
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
    sessionKey: new Uint8Array(16),
    expiresAt: 9999999999,
    allowedOps: ["recovery"] as string[],
    signature: new Uint8Array(32),
    tenantId: "t-1",
    accountId: "acc-1",
    deviceId: "dev-1",
  },
  onOpenDrawer: vi.fn(),
  onCloseDrawer: vi.fn(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsNfcSupported.mockReturnValue(true);
  mockExecuteRecovery.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCardRecovery", () => {
  it("returns initial idle state", async () => {
    const { useCardRecovery } = await import("../useCardRecovery");
    const { result } = renderHook(() => useCardRecovery(defaultOptions), {
      wrapper: createWrapper(),
    });

    expect(result.current.recoveryPhase).toBe("idle");
    expect(result.current.recoveryError).toBeNull();
    expect(result.current.recoveryPayload).toBeNull();
    expect(result.current.recoverySerial).toBeNull();
    expect(result.current.recoveryTargetCardId).toBeNull();
    expect(result.current.isRecovering).toBe(false);
  });

  describe("startCardRecovery", () => {
    it("sets target card id and opens drawer", async () => {
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.startCardRecovery("c-1");
      });

      expect(result.current.recoveryTargetCardId).toBe("c-1");
      expect(defaultOptions.onOpenDrawer).toHaveBeenCalled();
    });

    it("calls executeRecovery with correct params", async () => {
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.startCardRecovery("c-1");
      });

      expect(mockExecuteRecovery).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: "c-1",
          tenantId: "t-1",
          grant: defaultOptions.grant,
        }),
      );
    });

    it("throws error when grant is null", async () => {
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery({ ...defaultOptions, grant: null }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.startCardRecovery("c-1");
      });

      // Error is caught by mutation - toast.error should be called
      const { toast } = await import("sonner");
      expect(toast.error).toHaveBeenCalled();
    });

    it("throws error when NFC not supported", async () => {
      mockIsNfcSupported.mockReturnValue(false);
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.startCardRecovery("c-1");
      });

      const { toast } = await import("sonner");
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("handleRecoveryDrawerClose", () => {
    it("resets all recovery state", async () => {
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery(defaultOptions), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.handleRecoveryDrawerClose();
      });

      expect(result.current.recoveryPhase).toBe("idle");
      expect(result.current.recoveryError).toBeNull();
      expect(result.current.recoveryPayload).toBeNull();
      expect(result.current.recoverySerial).toBeNull();
      expect(result.current.recoveryTargetCardId).toBeNull();
      expect(defaultOptions.onCloseDrawer).toHaveBeenCalled();
    });
  });

  describe("handleRetryRecovery", () => {
    it("does nothing when no target card id", async () => {
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery(defaultOptions), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.handleRetryRecovery();
      });

      expect(mockExecuteRecovery).not.toHaveBeenCalled();
    });

    it("retries recovery with stored target card id", async () => {
      const { useCardRecovery } = await import("../useCardRecovery");
      const { result } = renderHook(() => useCardRecovery(defaultOptions), {
        wrapper: createWrapper(),
      });

      // First start recovery to set target
      await act(async () => {
        result.current.startCardRecovery("c-1");
      });

      vi.clearAllMocks();
      mockIsNfcSupported.mockReturnValue(true);
      mockExecuteRecovery.mockResolvedValue(undefined);

      // Retry
      await act(async () => {
        result.current.handleRetryRecovery();
      });

      expect(mockExecuteRecovery).toHaveBeenCalledWith(expect.objectContaining({ cardId: "c-1" }));
    });
  });
});
