/**
 * Tests for CardSection component.
 * Covers: rendering, conditional rendering, callback handlers,
 * drawer open/close logic, overwrite/not-blank dialog flows.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Captured props from mock components ──────────────────────────────────────

let nfcScanDrawerProps: Record<string, unknown> = {};
let topupDrawerProps: Record<string, unknown> = {};
let issueCardDrawerProps: Record<string, unknown> = {};
let overwriteDrawerProps: Record<string, unknown> = {};
let notBlankDrawerProps: Record<string, unknown> = {};
let syncConflictDialogProps: Record<string, unknown> = {};
let stationCardsPanelProps: Record<string, unknown> = {};

// ── Mock all hooks used by CardSection ───────────────────────────────────────

const mockScan = vi.fn();
const mockReset = vi.fn();
const mockCancel = vi.fn();
const mockRetryScan = vi.fn();
const mockHandleTopupCard = vi.fn();
const mockHandleTopupConfirm = vi.fn();
const mockSetResetCardPending = vi.fn();
const mockStartCardRecovery = vi.fn();
const mockHandleIssueCard = vi.fn();
const mockHandleIssuanceDrawerClose = vi.fn();
const mockHandleRetryIssuance = vi.fn();
const mockHandleForceOverwriteConfirm = vi.fn();
const mockCleanupIssuanceSession = vi.fn();
const mockHandleRecoveryDrawerClose = vi.fn();
const mockHandleRetryRecovery = vi.fn();
const mockRetryWithChanges = vi.fn();
const mockResetSync = vi.fn();
const mockDeleteMutate = vi.fn();
const mockSetIsDrawerOpen = vi.fn();
const mockSetOverwriteDialog = vi.fn();
const mockSetNotBlankDialog = vi.fn();
const mockCloseTopupDrawer = vi.fn();
const mockOpenFixCard = vi.fn();
const mockCloseFixCard = vi.fn();
const mockCloseIssueCardDrawer = vi.fn();

let mockShowFixCard = false;
let mockIsDrawerOpen = false;
let mockTopupDrawerOpen = false;
let mockIssueCardDrawerOpen = false;
let mockRecoveryDrawerOpen = false;
let mockOverwriteDialog: unknown = null;
let mockNotBlankDialog: unknown = null;
let mockSyncStatus = "idle";
let mockConflict: unknown = null;
let mockStatePhase = "idle";
let mockSerialNumber: string | null = null;

vi.mock("#/presentation/hooks/useSessionGrant", () => ({
  useSessionGrant: vi.fn(() => ({ grant: { sessionKey: "key", expiresAt: 9999999999 } })),
}));

vi.mock("#/presentation/hooks/useTenantSync", () => ({
  useTenantSync: vi.fn(() => ({
    get status() {
      return mockSyncStatus;
    },
    get conflict() {
      return mockConflict;
    },
    retryWithChanges: mockRetryWithChanges,
    reset: mockResetSync,
  })),
}));

vi.mock("#/presentation/hooks/useCardSection", () => ({
  useCardDrawers: vi.fn(() => ({
    get isDrawerOpen() {
      return mockIsDrawerOpen;
    },
    get topupDrawerOpen() {
      return mockTopupDrawerOpen;
    },
    get recoveryDrawerOpen() {
      return mockRecoveryDrawerOpen;
    },
    fixCardId: "fix-1",
    get showFixCard() {
      return mockShowFixCard;
    },
    get issueCardDrawerOpen() {
      return mockIssueCardDrawerOpen;
    },
    get overwriteDialog() {
      return mockOverwriteDialog;
    },
    get notBlankDialog() {
      return mockNotBlankDialog;
    },
    setIsDrawerOpen: mockSetIsDrawerOpen,
    setOverwriteDialog: mockSetOverwriteDialog,
    setNotBlankDialog: mockSetNotBlankDialog,
    openTopupDrawer: vi.fn(),
    closeTopupDrawer: mockCloseTopupDrawer,
    openRecoveryDrawer: vi.fn(),
    closeRecoveryDrawer: vi.fn(),
    openFixCard: mockOpenFixCard,
    closeFixCard: mockCloseFixCard,
    openIssueCardDrawer: vi.fn(),
    closeIssueCardDrawer: mockCloseIssueCardDrawer,
  })),
  useCardData: vi.fn(() => ({
    cards: { data: [], isLoading: false },
    members: { data: [], isLoading: false },
  })),
  useCardIssuance: vi.fn(() => ({
    issuancePhase: "idle",
    issuanceError: null,
    issuancePayload: null,
    issueCardDrawerPhase: "idle",
    isIssuing: false,
    handleIssueCard: mockHandleIssueCard,
    handleIssuanceDrawerClose: mockHandleIssuanceDrawerClose,
    handleRetryIssuance: mockHandleRetryIssuance,
    handleForceOverwriteConfirm: mockHandleForceOverwriteConfirm,
    cleanupIssuanceSession: mockCleanupIssuanceSession,
  })),
  useCardRecovery: vi.fn(() => ({
    recoveryPhase: "idle",
    recoveryError: null,
    recoveryPayload: null,
    recoverySerial: null,
    isRecovering: false,
    startCardRecovery: mockStartCardRecovery,
    handleRecoveryDrawerClose: mockHandleRecoveryDrawerClose,
    handleRetryRecovery: mockHandleRetryRecovery,
  })),
  useCardOperations: vi.fn(() => ({
    state: {
      get phase() {
        return mockStatePhase;
      },
      payload: null,
      error: null,
      tamperDetected: false,
      get serialNumber() {
        return mockSerialNumber;
      },
    },
    resetCardPending: false,
    setResetCardPending: mockSetResetCardPending,
    deleteCard: { mutate: mockDeleteMutate, isPending: false },
    fixCard: { mutateAsync: vi.fn(), isPending: false },
    handleTopupCard: mockHandleTopupCard,
    handleTopupConfirm: mockHandleTopupConfirm,
    scan: mockScan,
    reset: mockReset,
    cancel: mockCancel,
    retryScan: mockRetryScan,
  })),
  useCardSync: vi.fn(),
}));

// Mock child UI components - capture props for callback testing
vi.mock("../../block/StationCardsPanel", () => ({
  StationCardsPanel: React.forwardRef(function MockPanel(
    props: Record<string, unknown>,
    _ref: unknown,
  ) {
    stationCardsPanelProps = props;
    return <div data-testid="station-cards-panel" />;
  }),
}));

vi.mock("../../block/StationFixCardPanel", () => ({
  StationFixCardPanel: (_props: Record<string, unknown>) => {
    return <div data-testid="fix-card-panel" />;
  },
}));

vi.mock("../../block/dialogs/CardNotBlankDrawer", () => ({
  CardNotBlankDrawer: (props: Record<string, unknown>) => {
    notBlankDrawerProps = props;
    return <div data-testid="not-blank-drawer" />;
  },
}));

vi.mock("../../block/dialogs/CardOverwriteDrawer", () => ({
  CardOverwriteDrawer: (props: Record<string, unknown>) => {
    overwriteDrawerProps = props;
    return <div data-testid="overwrite-drawer" />;
  },
}));

vi.mock("../../block/dialogs/IssuanceScanDrawer", () => ({
  IssuanceScanDrawer: (_props: Record<string, unknown>) => {
    return <div data-testid="issuance-scan-drawer" />;
  },
}));

vi.mock("../../block/dialogs/IssueCardDrawer", () => ({
  IssueCardDrawer: (props: Record<string, unknown>) => {
    issueCardDrawerProps = props;
    return <div data-testid="issue-card-drawer" />;
  },
}));

vi.mock("../../block/dialogs/NfcScanDrawer", () => ({
  NfcScanDrawer: (props: Record<string, unknown>) => {
    nfcScanDrawerProps = props;
    return <div data-testid="nfc-scan-drawer" />;
  },
}));

vi.mock("../../block/dialogs/SyncConflictDialog", () => ({
  SyncConflictDialog: (props: Record<string, unknown>) => {
    syncConflictDialogProps = props;
    return <div data-testid="sync-conflict-dialog" />;
  },
}));

vi.mock("../../block/dialogs/TopupDrawer", () => ({
  TopupDrawer: (props: Record<string, unknown>) => {
    topupDrawerProps = props;
    return <div data-testid="topup-drawer" />;
  },
}));

vi.mock("../CardSection.utils", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object) };
});

// ── Import component under test ──────────────────────────────────────────────

import { CardSection } from "#/presentation/components/section/CardSection";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const defaultProps = {
  tenantId: "tenant-1",
  accountId: "account-1",
  deviceId: "device-1",
  terminalId: 1,
};

function renderComponent() {
  return render(<CardSection {...defaultProps} />, { wrapper: createWrapper() });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CardSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShowFixCard = false;
    mockIsDrawerOpen = false;
    mockTopupDrawerOpen = false;
    mockIssueCardDrawerOpen = false;
    mockRecoveryDrawerOpen = false;
    mockOverwriteDialog = null;
    mockNotBlankDialog = null;
    mockSyncStatus = "idle";
    mockConflict = null;
    mockStatePhase = "idle";
    mockSerialNumber = null;
    nfcScanDrawerProps = {};
    topupDrawerProps = {};
    issueCardDrawerProps = {};
    overwriteDrawerProps = {};
    notBlankDrawerProps = {};
    syncConflictDialogProps = {};
    stationCardsPanelProps = {};
  });

  describe("rendering", () => {
    it("renders StationCardsPanel when showFixCard is false", () => {
      const { container } = renderComponent();
      expect(container.querySelector('[data-testid="station-cards-panel"]')).not.toBeNull();
    });

    it("renders all drawer components", () => {
      const { container } = renderComponent();
      expect(container.querySelector('[data-testid="nfc-scan-drawer"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="topup-drawer"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="issue-card-drawer"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="issuance-scan-drawer"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="overwrite-drawer"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="not-blank-drawer"]')).not.toBeNull();
    });

    it("does not render SyncConflictDialog when no conflict", () => {
      const { container } = renderComponent();
      expect(container.querySelector('[data-testid="sync-conflict-dialog"]')).toBeNull();
    });

    it("renders SyncConflictDialog when conflict exists", () => {
      mockSyncStatus = "conflict";
      mockConflict = { type: "slug_only", existingSlug: "test", existingTenantName: "Test" };
      const { container } = renderComponent();
      expect(container.querySelector('[data-testid="sync-conflict-dialog"]')).not.toBeNull();
    });

    it("renders StationFixCardPanel when showFixCard is true", () => {
      mockShowFixCard = true;
      const { container } = renderComponent();
      expect(container.querySelector('[data-testid="fix-card-panel"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="station-cards-panel"]')).toBeNull();
    });
  });

  describe("StationCardsPanel callbacks", () => {
    it("calls handleTopupCard on onTopupCard", () => {
      renderComponent();
      act(() => {
        (stationCardsPanelProps.onTopupCard as Function)({ cardId: "c1" });
      });
      expect(mockHandleTopupCard).toHaveBeenCalledWith({ cardId: "c1" });
    });

    it("calls deleteCard.mutate on onDeleteCard", () => {
      renderComponent();
      act(() => {
        (stationCardsPanelProps.onDeleteCard as Function)({ cardId: "c1" });
      });
      expect(mockDeleteMutate).toHaveBeenCalledWith({ card: { cardId: "c1" } });
    });

    it("calls startCardRecovery on onRecoverCard", () => {
      renderComponent();
      act(() => {
        (stationCardsPanelProps.onRecoverCard as Function)({ cardId: "c1" });
      });
      expect(mockStartCardRecovery).toHaveBeenCalledWith("c1");
    });
  });

  describe("NfcScanDrawer callbacks", () => {
    it("handleDrawerClose calls reset when phase is idle", () => {
      mockStatePhase = "idle";
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onClose as Function)();
      });
      expect(mockReset).toHaveBeenCalled();
      expect(mockSetIsDrawerOpen).toHaveBeenCalledWith(false);
      expect(mockCloseTopupDrawer).toHaveBeenCalled();
      expect(mockSetResetCardPending).toHaveBeenCalledWith(false);
    });

    it("handleDrawerClose calls cancel when phase is scanning", () => {
      mockStatePhase = "scanning";
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onClose as Function)();
      });
      expect(mockCancel).toHaveBeenCalled();
    });

    it("handleDrawerClose calls cancel when phase is validating", () => {
      mockStatePhase = "validating";
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onClose as Function)();
      });
      expect(mockCancel).toHaveBeenCalled();
    });

    it("onOpenChange(false) triggers handleDrawerClose", () => {
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onOpenChange as Function)(false);
      });
      expect(mockReset).toHaveBeenCalled();
    });

    it("onRetry calls scan", () => {
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onRetry as Function)();
      });
      expect(mockScan).toHaveBeenCalled();
    });

    it("handleFixCard with valid hex serialNumber starts recovery", () => {
      mockSerialNumber = "04A2B3C4D5E6F7";
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onFixCard as Function)();
      });
      expect(mockStartCardRecovery).toHaveBeenCalledWith("04a2b3c4d5e6f7");
    });

    it("handleFixCard with null serialNumber opens fix card panel", () => {
      mockSerialNumber = null;
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onFixCard as Function)();
      });
      expect(mockOpenFixCard).toHaveBeenCalledWith(null);
    });

    it("handleFixCard with non-hex serialNumber opens fix card panel", () => {
      mockSerialNumber = "!!!";
      renderComponent();
      act(() => {
        (nfcScanDrawerProps.onFixCard as Function)();
      });
      expect(mockOpenFixCard).toHaveBeenCalledWith("!!!");
    });
  });

  describe("TopupDrawer callbacks", () => {
    it("onOpenChange(false) triggers handleDrawerClose", () => {
      renderComponent();
      act(() => {
        (topupDrawerProps.onOpenChange as Function)(false);
      });
      expect(mockReset).toHaveBeenCalled();
    });

    it("onTopup calls handleTopupConfirm", () => {
      renderComponent();
      act(() => {
        (topupDrawerProps.onTopup as Function)(5000);
      });
      expect(mockHandleTopupConfirm).toHaveBeenCalledWith(5000);
    });

    it("onRetry calls retryScan", () => {
      renderComponent();
      act(() => {
        (topupDrawerProps.onRetry as Function)();
      });
      expect(mockRetryScan).toHaveBeenCalled();
    });
  });

  describe("IssueCardDrawer callbacks", () => {
    it("onOpenChange(false) calls handleIssuanceDrawerClose", () => {
      renderComponent();
      act(() => {
        (issueCardDrawerProps.onOpenChange as Function)(false);
      });
      expect(mockHandleIssuanceDrawerClose).toHaveBeenCalled();
    });

    it("onIssue calls handleIssueCard", () => {
      renderComponent();
      act(() => {
        (issueCardDrawerProps.onIssue as Function)({ name: "Test" });
      });
      expect(mockHandleIssueCard).toHaveBeenCalledWith({ name: "Test" });
    });
  });

  describe("CardOverwriteDrawer callbacks", () => {
    it("onCancel clears dialog and cleans up issuance", () => {
      mockOverwriteDialog = {
        existingCard: { cardId: "c1" },
        pendingIssue: { name: "Test", userId: "u1" },
      };
      renderComponent();
      act(() => {
        (overwriteDrawerProps.onCancel as Function)();
      });
      expect(mockSetOverwriteDialog).toHaveBeenCalledWith(null);
      expect(mockCleanupIssuanceSession).toHaveBeenCalled();
      expect(mockCloseIssueCardDrawer).toHaveBeenCalled();
    });

    it("onConfirm calls handleForceOverwriteConfirm", async () => {
      mockOverwriteDialog = {
        existingCard: { cardId: "c1" },
        pendingIssue: { name: "Test", userId: "u1" },
      };
      mockHandleForceOverwriteConfirm.mockResolvedValue(undefined);
      renderComponent();
      await act(async () => {
        await (overwriteDrawerProps.onConfirm as Function)();
      });
      expect(mockSetOverwriteDialog).toHaveBeenCalledWith(null);
      expect(mockHandleForceOverwriteConfirm).toHaveBeenCalled();
    });
  });

  describe("CardNotBlankDrawer callbacks", () => {
    it("onCancel clears dialog and cleans up issuance", () => {
      mockNotBlankDialog = { cardSerial: "aabb", pendingIssue: { name: "Test", userId: "u1" } };
      renderComponent();
      act(() => {
        (notBlankDrawerProps.onCancel as Function)();
      });
      expect(mockSetNotBlankDialog).toHaveBeenCalledWith(null);
      expect(mockCleanupIssuanceSession).toHaveBeenCalled();
      expect(mockCloseIssueCardDrawer).toHaveBeenCalled();
    });

    it("onConfirm calls handleForceOverwriteConfirm", async () => {
      mockNotBlankDialog = { cardSerial: "aabb", pendingIssue: { name: "Test", userId: "u1" } };
      mockHandleForceOverwriteConfirm.mockResolvedValue(undefined);
      renderComponent();
      await act(async () => {
        await (notBlankDrawerProps.onConfirm as Function)();
      });
      expect(mockSetNotBlankDialog).toHaveBeenCalledWith(null);
      expect(mockHandleForceOverwriteConfirm).toHaveBeenCalled();
    });
  });

  describe("SyncConflictDialog callbacks", () => {
    it("onDismiss calls resetSync", () => {
      mockSyncStatus = "conflict";
      mockConflict = { type: "slug_only", existingSlug: "test", existingTenantName: "Test" };
      renderComponent();
      act(() => {
        (syncConflictDialogProps.onDismiss as Function)();
      });
      expect(mockResetSync).toHaveBeenCalled();
    });

    it("onRetryWithChanges calls retryWithChanges", () => {
      mockSyncStatus = "conflict";
      mockConflict = { type: "slug_only", existingSlug: "test", existingTenantName: "Test" };
      renderComponent();
      act(() => {
        (syncConflictDialogProps.onRetryWithChanges as Function)("new-slug", "new-admin");
      });
      expect(mockRetryWithChanges).toHaveBeenCalledWith("new-slug", "new-admin");
    });
  });
});
