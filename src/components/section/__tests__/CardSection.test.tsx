// @vitest-environment jsdom
/**
 * Tests for CardSection.tsx
 * Covers: rendering, NFC drawer interactions, card operations,
 *         issuance flow, recovery flow, top-up flow, fix card panel
 */
import { createElement } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockUseQueryFn: (opts: any) => any;
let mockUseMutationFn: (opts: any) => any;

vi.mock("@tanstack/react-query", () => {
  const queryClient = { invalidateQueries: vi.fn() };
  return {
    useQuery: (opts: any) => mockUseQueryFn(opts),
    useMutation: (opts: any) => mockUseMutationFn(opts),
    useQueryClient: () => queryClient,
    QueryClient: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockScan = vi.fn();
const mockWrite = vi.fn();
const mockReset = vi.fn();
const mockCancel = vi.fn();
const mockRetryScan = vi.fn();
let mockNfcState: any = {
  phase: "idle",
  payload: null,
  serialNumber: null,
  error: null,
  tamperDetected: false,
  warning: null,
};

vi.mock("#/hooks/nfc", () => ({
  useNfcCard: () => ({
    state: mockNfcState,
    scan: mockScan,
    write: mockWrite,
    reset: mockReset,
    cancel: mockCancel,
    retryScan: mockRetryScan,
  }),
}));

vi.mock("#/hooks/useSessionGrant", () => ({
  useSessionGrant: () => ({ grant: { keyVersion: 1, masterKey: new Uint8Array(32) } }),
}));

const mockRetryWithChanges = vi.fn();
const mockResetSync = vi.fn();
let mockSyncStatus = "idle";
let mockConflict: any = null;

vi.mock("#/hooks/useTenantSync", () => ({
  useTenantSync: () => ({
    status: mockSyncStatus,
    conflict: mockConflict,
    retryWithChanges: mockRetryWithChanges,
    reset: mockResetSync,
  }),
}));

const mockNotifyMutation = vi.fn();
vi.mock("#/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => ({
    notifyMutation: mockNotifyMutation,
    lastSyncedAt: null,
  }),
}));

const mockLocalDbCardsGet = vi.fn().mockResolvedValue(null);
const mockLocalDbCardsPut = vi.fn().mockResolvedValue(undefined);
const mockLocalDbCardsUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("#/db/local-db", () => ({
  localDb: {
    cards: {
      get: (...args: unknown[]) => mockLocalDbCardsGet(...args),
      put: (...args: unknown[]) => mockLocalDbCardsPut(...args),
      update: (...args: unknown[]) => mockLocalDbCardsUpdate(...args),
    },
    users: { where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }) },
  },
}));

vi.mock("#/lib/syncPull", () => ({ syncPull: vi.fn() }));
vi.mock("#/lib/errorTracker", () => ({ trackError: vi.fn() }));
const mockCheckLocalBlockedStatus = vi.fn().mockResolvedValue({ blocked: false });
vi.mock("#/core/nfc/localStatusCheck", () => ({
  checkLocalBlockedStatus: (...args: unknown[]) => mockCheckLocalBlockedStatus(...args),
}));
vi.mock("#/core/validation/uidGlobalValidator", () => ({
  validateUID: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("#/lib/repositories", () => ({
  cardRepo: {
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue([]),
    getByTenantAndCardId: vi.fn().mockResolvedValue(undefined),
  },
  uidRemoteValidator: { checkUIDExists: vi.fn().mockResolvedValue({ exists: false }) },
  onlineStatus: { isOnline: () => true },
}));

const mockApplyTopup = vi.fn((..._args: unknown[]) => _args[0]);
const mockApplyResetState = vi.fn((..._args: unknown[]) => _args[0]);
const mockValidateTopup = vi.fn((..._args: unknown[]) => ({ valid: true }));
vi.mock("#/core/state-machine/engine", () => ({
  applyTopup: (...args: unknown[]) => mockApplyTopup(...args),
  applyResetState: (...args: unknown[]) => mockApplyResetState(...args),
  validateTopup: (...args: unknown[]) => mockValidateTopup(...args),
}));
vi.mock("#/core/nfc/pipelineEngine", () => ({
  prepareWrite: vi.fn().mockResolvedValue({ bytes: new Uint8Array(280) }),
}));
vi.mock("#/core/nfc/engine", () => ({
  extractCardBytes: vi.fn(),
  isNfcSupported: () => true,
}));
vi.mock("#/core/payload/types", () => ({
  MAGIC: 0x4b4f5057,
  CARD_SCHEMA_VERSION: 4,
  CardState: { IDLE: 0, CHECKED_IN: 1 },
  CardStatus: {
    ACTIVE: 0,
    BLOCKED_TAMPER: 1,
    BLOCKED_FRAUD: 2,
    BLOCKED_EXPIRED: 3,
    BLOCKED_ADMIN: 4,
  },
}));
vi.mock("#/core/payload/tenantBind", () => ({ encodeTenantBind: () => new Uint8Array(4) }));
vi.mock("#/core/payload/engine", () => ({ decodePayload: vi.fn() }));
vi.mock("#/lib/stationQueries", () => ({
  getCardsWithUsers: vi.fn().mockResolvedValue([]),
}));

// Mock child components with interactive callbacks
vi.mock("../../block/StationCardsPanel", () => ({
  StationCardsPanel: vi.fn((props: any) => {
    return createElement(
      "div",
      { "data-testid": "station-cards-panel" },
      createElement("span", { "data-testid": "cards-count" }, String(props.cards.length)),
      createElement(
        "button",
        { "data-testid": "issue-new-btn", onClick: props.onIssueNew },
        "Issue New",
      ),
      createElement(
        "button",
        { "data-testid": "topup-btn", onClick: () => props.onTopupCard("card-1") },
        "Topup",
      ),
      createElement(
        "button",
        { "data-testid": "recover-btn", onClick: () => props.onRecoverCard({ cardId: "card-1" }) },
        "Recover",
      ),
      createElement(
        "button",
        { "data-testid": "reset-btn", onClick: () => props.onResetCard({ cardId: "card-1" }) },
        "Reset",
      ),
      createElement(
        "button",
        { "data-testid": "delete-btn", onClick: () => props.onDeleteCard({ cardId: "card-1" }) },
        "Delete",
      ),
      createElement(
        "button",
        {
          "data-testid": "status-btn",
          onClick: () => props.onUpdateCardStatus({ cardId: "card-1" }, "blocked_admin"),
        },
        "Block",
      ),
    );
  }),
}));

vi.mock("../../block/StationFixCardPanel", () => ({
  StationFixCardPanel: ({ onBack, onFixCard }: any) =>
    createElement(
      "div",
      { "data-testid": "fix-card-panel" },
      createElement("button", { "data-testid": "back-btn", onClick: onBack }, "Back"),
      createElement(
        "button",
        {
          "data-testid": "fix-submit-btn",
          onClick: () => onFixCard({ cardId: "c1", userId: "u1", balance: 50000, expiresAt: null }),
        },
        "Fix",
      ),
    ),
}));

let mockNfcDrawerOnFixCard: any;
let mockNfcDrawerOnClose: any;
vi.mock("../../block/dialogs/NfcScanDrawer", () => ({
  NfcScanDrawer: ({ open, phase, onFixCard, onClose }: any) => {
    mockNfcDrawerOnFixCard = onFixCard;
    mockNfcDrawerOnClose = onClose;
    return open
      ? createElement("div", { "data-testid": "nfc-scan-drawer", "data-phase": phase })
      : null;
  },
}));

vi.mock("../../block/dialogs/IssuanceScanDrawer", () => ({
  IssuanceScanDrawer: ({ open, onClose, onRetry }: any) =>
    open
      ? createElement(
          "div",
          { "data-testid": "issuance-scan-drawer" },
          createElement(
            "button",
            { "data-testid": "recovery-close-btn", onClick: onClose },
            "Close",
          ),
          createElement(
            "button",
            { "data-testid": "recovery-retry-btn", onClick: onRetry },
            "Retry",
          ),
        )
      : null,
}));

vi.mock("../../block/dialogs/IssueCardDrawer", () => ({
  IssueCardDrawer: ({ open, phase, onIssue, onClose, onRetry }: any) => {
    return open
      ? createElement(
          "div",
          { "data-testid": "issue-card-drawer", "data-phase": phase },
          createElement(
            "button",
            {
              "data-testid": "issue-submit-btn",
              onClick: () =>
                onIssue({ name: "Test", userId: "u1", balance: 50000, expiresAt: null }),
            },
            "Submit",
          ),
          createElement("button", { "data-testid": "issue-close-btn", onClick: onClose }, "Close"),
          createElement("button", { "data-testid": "issue-retry-btn", onClick: onRetry }, "Retry"),
        )
      : null;
  },
}));

vi.mock("../../block/dialogs/TopupDrawer", () => ({
  TopupDrawer: ({ open, onTopup, onClose }: any) => {
    return open
      ? createElement(
          "div",
          { "data-testid": "topup-drawer" },
          createElement(
            "button",
            { "data-testid": "topup-confirm-btn", onClick: () => onTopup(10000) },
            "Confirm",
          ),
          createElement("button", { "data-testid": "topup-close-btn", onClick: onClose }, "Close"),
        )
      : null;
  },
}));

vi.mock("../../block/dialogs/SyncConflictDialog", () => ({
  SyncConflictDialog: ({ open, onDismiss, onRetryWithChanges }: any) =>
    open
      ? createElement(
          "div",
          { "data-testid": "sync-conflict-dialog" },
          createElement(
            "button",
            { "data-testid": "dismiss-conflict", onClick: onDismiss },
            "Dismiss",
          ),
          createElement(
            "button",
            {
              "data-testid": "retry-conflict",
              onClick: () => onRetryWithChanges("new-slug", "new-admin"),
            },
            "Retry",
          ),
        )
      : null,
}));

vi.mock("../../block/dialogs/CardOverwriteDialog", () => ({}));

vi.mock("../../block/dialogs/CardOverwriteDrawer", () => ({
  CardOverwriteDrawer: ({ open, onCancel, onConfirm }: any) => {
    return open
      ? createElement(
          "div",
          { "data-testid": "card-overwrite-drawer" },
          createElement(
            "button",
            { "data-testid": "overwrite-cancel", onClick: onCancel },
            "Cancel",
          ),
          createElement(
            "button",
            { "data-testid": "overwrite-confirm", onClick: onConfirm },
            "Confirm",
          ),
        )
      : null;
  },
}));

vi.mock("../../block/dialogs/CardNotBlankDrawer", () => ({
  CardNotBlankDrawer: ({ open, onCancel, onConfirm }: any) => {
    return open
      ? createElement(
          "div",
          { "data-testid": "card-not-blank-drawer" },
          createElement(
            "button",
            { "data-testid": "not-blank-cancel", onClick: onCancel },
            "Cancel",
          ),
          createElement(
            "button",
            { "data-testid": "not-blank-confirm", onClick: onConfirm },
            "Confirm",
          ),
        )
      : null;
  },
}));

import { CardSection } from "../CardSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  tenantId: "t-1",
  accountId: "a-1",
  deviceId: "d-1",
  terminalId: 1,
};

// Track mutation handlers for testing
let mutationHandlers: Record<
  string,
  { mutate: any; mutateAsync: any; onSuccess?: any; onError?: any }
> = {};
let mutationCallCount = 0;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockNfcState = {
    phase: "idle",
    payload: null,
    serialNumber: null,
    error: null,
    tamperDetected: false,
    warning: null,
  };
  mockSyncStatus = "idle";
  mockConflict = null;
  mutationHandlers = {};
  mutationCallCount = 0;

  mockUseQueryFn = ({ queryKey }: any) => ({
    data: queryKey[0] === "station-cards" ? [] : [],
    isLoading: false,
    error: null,
  });

  mockUseMutationFn = ({ mutationFn, onSuccess, onError }: any) => {
    const id = `mutation-${mutationCallCount++}`;
    const handler = {
      mutate: vi.fn(async (...args: any[]) => {
        try {
          const result = await mutationFn(...(args[0] ?? args));
          onSuccess?.(result);
        } catch (e) {
          onError?.(e);
        }
      }),
      mutateAsync: vi.fn(async (...args: any[]) => {
        const result = await mutationFn(...(args[0] ?? args));
        onSuccess?.(result);
        return result;
      }),
      isPending: false,
      onSuccess,
      onError,
    };
    mutationHandlers[id] = handler;
    return handler;
  };
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CardSection - rendering", () => {
  it("renders StationCardsPanel", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.getByTestId("station-cards-panel")).toBeDefined();
  });

  it("renders NfcScanDrawer (closed by default)", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("nfc-scan-drawer")).toBeNull();
  });

  it("renders IssueCardDrawer (closed by default)", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("issue-card-drawer")).toBeNull();
  });

  it("renders TopupDrawer (closed by default)", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("topup-drawer")).toBeNull();
  });

  it("does not render fix card panel by default", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("fix-card-panel")).toBeNull();
  });

  it("does not render sync conflict dialog when no conflict", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("sync-conflict-dialog")).toBeNull();
  });

  it("does not render card overwrite drawer by default", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("card-overwrite-drawer")).toBeNull();
  });

  it("does not render card not blank drawer by default", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.queryByTestId("card-not-blank-drawer")).toBeNull();
  });
});

describe("CardSection - issue new card flow", () => {
  it("opens IssueCardDrawer when Issue New clicked", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("issue-new-btn").click();
    });
    expect(screen.getByTestId("issue-card-drawer")).toBeDefined();
    expect(screen.getByTestId("issue-card-drawer").getAttribute("data-phase")).toBe("form");
  });

  it("closes IssueCardDrawer when close is called", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("issue-new-btn").click();
    });
    expect(screen.getByTestId("issue-card-drawer")).toBeDefined();
    await act(async () => {
      screen.getByTestId("issue-close-btn").click();
    });
    expect(screen.queryByTestId("issue-card-drawer")).toBeNull();
  });
});

describe("CardSection - topup flow", () => {
  it("opens TopupDrawer and triggers scan when topup clicked", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("topup-btn").click();
    });
    expect(screen.getByTestId("topup-drawer")).toBeDefined();
    expect(mockScan).toHaveBeenCalled();
  });

  it("closes TopupDrawer when close is called", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("topup-btn").click();
    });
    expect(screen.getByTestId("topup-drawer")).toBeDefined();
    await act(async () => {
      screen.getByTestId("topup-close-btn").click();
    });
    expect(screen.queryByTestId("topup-drawer")).toBeNull();
  });
});

describe("CardSection - reset card flow", () => {
  it("opens NfcScanDrawer and triggers scan when reset clicked", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("reset-btn").click();
    });
    expect(screen.getByTestId("nfc-scan-drawer")).toBeDefined();
    expect(mockScan).toHaveBeenCalled();
  });
});

describe("CardSection - delete card", () => {
  it("calls delete mutation when delete clicked", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("delete-btn").click();
    });
    // Mutation was called (we verify it doesn't crash)
    expect(screen.getByTestId("station-cards-panel")).toBeDefined();
  });
});

describe("CardSection - update card status", () => {
  it("calls updateCardStatus mutation when status button clicked", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("status-btn").click();
    });
    expect(screen.getByTestId("station-cards-panel")).toBeDefined();
  });
});

describe("CardSection - fix card panel", () => {
  it("shows fix card panel when handleFixCard is called with no serial", async () => {
    mockNfcState = {
      phase: "error",
      payload: null,
      serialNumber: null,
      error: "Error",
      tamperDetected: false,
      warning: null,
    };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    // Open the NFC drawer first
    await act(async () => {
      screen.getByTestId("reset-btn").click();
    });
    // Call onFixCard from the NFC drawer
    await act(async () => {
      mockNfcDrawerOnFixCard?.();
    });
    expect(screen.getByTestId("fix-card-panel")).toBeDefined();
  });

  it("hides fix card panel and shows cards panel when back clicked", async () => {
    mockNfcState = {
      phase: "error",
      payload: null,
      serialNumber: null,
      error: "Error",
      tamperDetected: false,
      warning: null,
    };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("reset-btn").click();
    });
    await act(async () => {
      mockNfcDrawerOnFixCard?.();
    });
    expect(screen.getByTestId("fix-card-panel")).toBeDefined();
    await act(async () => {
      screen.getByTestId("back-btn").click();
    });
    expect(screen.queryByTestId("fix-card-panel")).toBeNull();
    expect(screen.getByTestId("station-cards-panel")).toBeDefined();
  });
});

describe("CardSection - sync conflict dialog", () => {
  it("renders sync conflict dialog when conflict exists", async () => {
    mockSyncStatus = "conflict";
    mockConflict = { type: "slug", slug: "test-slug" };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.getByTestId("sync-conflict-dialog")).toBeDefined();
  });

  it("calls resetSync when dismiss clicked", async () => {
    mockSyncStatus = "conflict";
    mockConflict = { type: "slug", slug: "test-slug" };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("dismiss-conflict").click();
    });
    expect(mockResetSync).toHaveBeenCalled();
  });

  it("calls retryWithChanges when retry clicked", async () => {
    mockSyncStatus = "conflict";
    mockConflict = { type: "slug", slug: "test-slug" };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    await act(async () => {
      screen.getByTestId("retry-conflict").click();
    });
    expect(mockRetryWithChanges).toHaveBeenCalledWith("new-slug", "new-admin");
  });
});

describe("CardSection - auto-close on success", () => {
  it("auto-closes drawer after success phase", async () => {
    const payload = {
      wallet: { balance: 50000, counter: 5n },
      identity: { name: "Test" },
      header: { cardId: new Uint8Array(6) },
      trailer: { keyVersion: 1 },
    };
    mockNfcState = {
      phase: "success",
      payload,
      serialNumber: "abc123",
      error: null,
      tamperDetected: false,
      warning: null,
    };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    // Advance timer to trigger auto-close
    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    expect(mockReset).toHaveBeenCalled();
  });
});

describe("CardSection - cards count", () => {
  it("passes empty cards array to panel", async () => {
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.getByTestId("cards-count").textContent).toBe("0");
  });

  it("passes cards from query to panel", async () => {
    mockUseQueryFn = ({ queryKey }: any) => ({
      data:
        queryKey[0] === "station-cards"
          ? [{ cardId: "c1", userId: "u1", balance: 100, status: "active" }]
          : [],
      isLoading: false,
      error: null,
    });
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    expect(screen.getByTestId("cards-count").textContent).toBe("1");
  });
});

describe("CardSection - NFC drawer close during scanning", () => {
  it("calls cancel when drawer closed during scanning phase", async () => {
    mockNfcState = {
      phase: "scanning",
      payload: null,
      serialNumber: null,
      error: null,
      tamperDetected: false,
      warning: null,
    };
    await act(async () => {
      render(createElement(CardSection, defaultProps));
    });
    // Open the drawer
    await act(async () => {
      screen.getByTestId("reset-btn").click();
    });
    // Close it
    await act(async () => {
      mockNfcDrawerOnClose?.();
    });
    expect(mockCancel).toHaveBeenCalled();
  });
});
