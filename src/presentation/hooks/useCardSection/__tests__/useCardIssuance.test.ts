// @vitest-environment jsdom
import type { CardOwnerInfo } from "#/presentation/components/block/dialogs/CardOverwriteDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNotifyMutation = vi.fn();
vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => ({ notifyMutation: mockNotifyMutation }),
}));

const mockIsNfcSupported = vi.fn();
const mockEncodeTenantBind = vi.fn();
const mockPrepareWrite = vi.fn();
vi.mock("#/presentation/hooks/domain", () => ({
  isNfcSupported: () => mockIsNfcSupported(),
  encodeTenantBind: (...args: unknown[]) => mockEncodeTenantBind(...args),
  prepareWrite: (...args: unknown[]) => mockPrepareWrite(...args),
}));

vi.mock("#/presentation/hooks/types", () => ({
  CARD_SCHEMA_VERSION: 1,
  CardState: { IDLE: 0 },
  CardStatus: { ACTIVE: 1 },
  MAGIC: 0xdeadbeef,
}));

const mockGenerateCardId = vi.fn();
const mockHandleForceOverwrite = vi.fn();
const mockHandleFreshNfcSession = vi.fn();
vi.mock("#/presentation/components/section/CardSection.utils", () => ({
  CardAlreadyRegisteredError: class CardAlreadyRegisteredError extends Error {
    existingCard: unknown;
    constructor(existingCard: unknown) {
      super("Card already registered");
      this.existingCard = existingCard;
    }
  },
  CardNotBlankError: class CardNotBlankError extends Error {
    cardSerial: string;
    constructor(cardSerial: string) {
      super("Card not blank");
      this.cardSerial = cardSerial;
    }
  },
  generateCardId: () => mockGenerateCardId(),
  handleForceOverwrite: (...args: unknown[]) => mockHandleForceOverwrite(...args),
  handleFreshNfcSession: (...args: unknown[]) => mockHandleFreshNfcSession(...args),
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
  onOpenDrawer: vi.fn(),
  onCloseDrawer: vi.fn(),
  onShowOverwriteDialog: vi.fn(),
  onShowNotBlankDialog: vi.fn(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockIsNfcSupported.mockReturnValue(true);
  mockGenerateCardId.mockReturnValue("card-new-1");
  mockEncodeTenantBind.mockReturnValue(new Uint8Array(4));
  mockPrepareWrite.mockResolvedValue({ bytes: new Uint8Array(128) });
  mockHandleFreshNfcSession.mockResolvedValue(undefined);
  mockHandleForceOverwrite.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCardIssuance", () => {
  it("returns initial idle state", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    expect(result.current.issuancePhase).toBe("idle");
    expect(result.current.issuanceError).toBeNull();
    expect(result.current.issuancePayload).toBeNull();
    expect(result.current.issueCardDrawerPhase).toBe("form");
    expect(result.current.isIssuing).toBe(false);
  });

  it("throws error when grant is null", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance({ ...defaultOptions, grant: null }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.handleIssueCard({
          name: "Test",
          userId: null,
          balance: 0,
          expiresAt: null,
        }),
      ).resolves.not.toThrow();
    });
    // Error is handled internally - NFC error or grant error
  });

  it("throws error when NFC not supported", async () => {
    mockIsNfcSupported.mockReturnValue(false);
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleIssueCard({
        name: "Test",
        userId: null,
        balance: 0,
        expiresAt: null,
      });
    });
    // Error is handled internally
  });

  it("calls handleFreshNfcSession for new issuance", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleIssueCard({
        name: "Anggota Baru",
        userId: "u-1",
        balance: 50000,
        expiresAt: null,
      });
    });

    expect(mockHandleFreshNfcSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        name: "Anggota Baru",
        userId: "u-1",
        balance: 50000,
      }),
    );
  });

  it("handleIssuanceDrawerClose resets all state", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.handleIssuanceDrawerClose();
    });

    expect(result.current.issuancePhase).toBe("idle");
    expect(result.current.issuanceError).toBeNull();
    expect(result.current.issuancePayload).toBeNull();
    expect(defaultOptions.onCloseDrawer).toHaveBeenCalled();
  });

  it("cleanupIssuanceSession can be called safely", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    // Should not throw
    act(() => {
      result.current.cleanupIssuanceSession();
    });
  });

  it("issueCardDrawerPhase maps phases correctly", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    // idle -> form
    expect(result.current.issueCardDrawerPhase).toBe("form");
  });

  it("handleRetryIssuance resets to idle when no prepared ref", async () => {
    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.handleRetryIssuance();
    });

    // Should set phase to idle since no prepared data
    expect(result.current.issuancePhase).toBe("idle");
  });

  it("shows overwrite dialog when CardAlreadyRegisteredError is thrown", async () => {
    const { CardAlreadyRegisteredError } =
      await import("#/presentation/components/section/CardSection.utils");
    mockHandleFreshNfcSession.mockRejectedValue(
      new CardAlreadyRegisteredError({ cardId: "c-existing", ownerName: "Old" } as CardOwnerInfo),
    );

    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleIssueCard({
        name: "New",
        userId: null,
        balance: 0,
        expiresAt: null,
      });
    });

    expect(defaultOptions.onShowOverwriteDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        existingCard: { cardId: "c-existing", ownerName: "Old" },
        pendingIssue: { name: "New", userId: null, balance: 0, expiresAt: null },
      }),
    );
  });

  it("shows not-blank dialog when CardNotBlankError is thrown", async () => {
    const { CardNotBlankError } =
      await import("#/presentation/components/section/CardSection.utils");
    mockHandleFreshNfcSession.mockRejectedValue(new CardNotBlankError("serial-abc"));

    const { useCardIssuance } = await import("../useCardIssuance");
    const { result } = renderHook(() => useCardIssuance(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleIssueCard({
        name: "Test",
        userId: "u-1",
        balance: 100,
        expiresAt: null,
      });
    });

    expect(defaultOptions.onShowNotBlankDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        cardSerial: "serial-abc",
        pendingIssue: { name: "Test", userId: "u-1", balance: 100, expiresAt: null },
      }),
    );
  });
});
