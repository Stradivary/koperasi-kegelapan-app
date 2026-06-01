// @vitest-environment jsdom
/**
 * Tests for src/components/section/CardSection.tsx
 * Tests the helper functions and component rendering.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();
const mockUseSessionGrant = vi.fn();
const mockUseNfcCard = vi.fn();
const mockUseTenantSync = vi.fn();
const mockUseSyncEngineContext = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: (opts: any) => mockUseMutation(opts),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("#/db/local-db", () => ({
  localDb: {
    cards: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    users: {
      get: vi.fn().mockResolvedValue(null),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
  },
}));

vi.mock("#/lib/syncPull", () => ({
  syncPull: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#/hooks/useSessionGrant", () => ({
  useSessionGrant: (...args: unknown[]) => mockUseSessionGrant(...args),
}));

vi.mock("#/hooks/nfc", () => ({
  useNfcCard: (...args: unknown[]) => mockUseNfcCard(...args),
}));

vi.mock("#/hooks/useTenantSync", () => ({
  useTenantSync: () => mockUseTenantSync(),
}));

vi.mock("#/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => mockUseSyncEngineContext(),
}));

vi.mock("#/core/state-machine/engine", () => ({
  applyTopup: vi.fn(),
  applyResetState: vi.fn(),
  validateTopup: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("#/core/nfc/pipelineEngine", () => ({
  prepareWrite: vi.fn().mockResolvedValue({ bytes: new Uint8Array(128) }),
}));

vi.mock("#/core/nfc/engine", () => ({
  extractCardBytes: vi.fn().mockReturnValue(null),
  isNfcSupported: vi.fn().mockReturnValue(false),
}));

vi.mock("#/core/payload/types", () => ({
  MAGIC: 0x4b52,
  CARD_SCHEMA_VERSION: 2,
  CardState: { IDLE: 0 },
  CardStatus: {
    ACTIVE: 0,
    BLOCKED_TAMPER: 1,
    BLOCKED_FRAUD: 2,
    BLOCKED_EXPIRED: 3,
    BLOCKED_ADMIN: 4,
  },
}));

vi.mock("#/core/payload/tenantBind", () => ({
  encodeTenantBind: vi.fn().mockReturnValue(0),
}));

vi.mock("#/core/nfc/localStatusCheck", () => ({
  checkLocalBlockedStatus: vi.fn().mockResolvedValue({ blocked: false }),
}));

vi.mock("#/core/validation/uidGlobalValidator", () => ({
  validateUID: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("#/lib/repositories", () => ({
  cardRepo: {
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue([]),
    getByTenantAndCardId: vi.fn().mockResolvedValue(undefined),
  },
  userRepo: { getByTenantAndUserId: vi.fn().mockResolvedValue(undefined) },
  uidRemoteValidator: { checkUIDExists: vi.fn().mockResolvedValue({ exists: false }) },
  onlineStatus: { isOnline: () => true },
}));

vi.mock("#/core/payload/engine", () => ({
  decodePayload: vi.fn(),
}));

vi.mock("#/lib/stationQueries", () => ({
  getCardsWithUsers: vi.fn().mockResolvedValue([]),
}));

vi.mock("#/lib/errorTracker", () => ({
  trackError: vi.fn(),
}));

vi.mock("../../../components/block/StationCardsPanel", () => ({
  StationCardsPanel: React.forwardRef(({ cards, isLoading, onIssueNew }: any, _ref: any) => (
    <div
      data-testid="station-cards-panel"
      data-count={cards.length}
      data-loading={String(isLoading)}
    >
      <button data-testid="issue-new-btn" onClick={onIssueNew}>
        Issue New
      </button>
    </div>
  )),
}));

vi.mock("../../../components/block/StationFixCardPanel", () => ({
  StationFixCardPanel: () => <div data-testid="station-fix-card-panel" />,
}));

vi.mock("../../../components/block/dialogs/SyncConflictDialog", () => ({
  SyncConflictDialog: () => <div data-testid="sync-conflict-dialog" />,
}));

vi.mock("../../../components/block/dialogs/CardOverwriteDialog", () => ({
  CardOverwriteDialog: () => null,
}));

vi.mock("../../../components/block/dialogs/CardOverwriteDrawer", () => ({
  CardOverwriteDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="card-overwrite-drawer" data-open={String(open)} />
  ),
}));

vi.mock("../../../components/block/dialogs/CardNotBlankDrawer", () => ({
  CardNotBlankDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="card-not-blank-drawer" data-open={String(open)} />
  ),
}));

vi.mock("../../../components/block/dialogs/NfcScanDrawer", () => ({
  NfcScanDrawer: ({ open, phase }: { open: boolean; phase: string }) => (
    <div data-testid="nfc-scan-drawer" data-open={String(open)} data-phase={phase} />
  ),
}));

vi.mock("../../../components/block/dialogs/IssuanceScanDrawer", () => ({
  IssuanceScanDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="issuance-scan-drawer" data-open={String(open)} />
  ),
}));

vi.mock("../../../components/block/dialogs/IssueCardDrawer", () => ({
  IssueCardDrawer: ({ open, phase }: { open: boolean; phase: string }) => (
    <div data-testid="issue-card-drawer" data-open={String(open)} data-phase={phase} />
  ),
}));

vi.mock("../../../components/block/dialogs/TopupDrawer", () => ({
  TopupDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="topup-drawer" data-open={String(open)} />
  ),
}));

import { CardSection } from "#/components/section/CardSection";

const defaultProps = {
  tenantId: "t-1",
  accountId: "a-1",
  deviceId: "d-1",
  terminalId: 1,
};

describe("CardSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSessionGrant.mockReturnValue({ grant: { keyVersion: 1 }, loading: false });
    mockUseNfcCard.mockReturnValue({
      state: { phase: "idle", payload: null, serialNumber: null },
      scan: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
      cancel: vi.fn(),
      retryScan: vi.fn(),
    });
    mockUseTenantSync.mockReturnValue({
      status: "idle",
      conflict: null,
      retryWithChanges: vi.fn(),
      reset: vi.fn(),
    });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: vi.fn() });
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("renders StationCardsPanel", () => {
    render(<CardSection {...defaultProps} />);
    expect(screen.getByTestId("station-cards-panel")).toBeDefined();
  });

  it("renders NfcScanDrawer closed initially", () => {
    render(<CardSection {...defaultProps} />);
    const drawer = screen.getByTestId("nfc-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
  });

  it("renders IssueCardDrawer closed initially", () => {
    render(<CardSection {...defaultProps} />);
    const drawer = screen.getByTestId("issue-card-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
  });

  it("renders TopupDrawer closed initially", () => {
    render(<CardSection {...defaultProps} />);
    const drawer = screen.getByTestId("topup-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
  });

  it("renders CardOverwriteDrawer closed initially", () => {
    render(<CardSection {...defaultProps} />);
    const drawer = screen.getByTestId("card-overwrite-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
  });

  it("renders CardNotBlankDrawer closed initially", () => {
    render(<CardSection {...defaultProps} />);
    const drawer = screen.getByTestId("card-not-blank-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
  });

  it("renders IssuanceScanDrawer closed initially", () => {
    render(<CardSection {...defaultProps} />);
    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
  });

  it("passes cards data to StationCardsPanel", () => {
    const cards = [
      { cardId: "abc123", userId: "u-1", status: "active", balance: 50000 },
      { cardId: "def456", userId: "u-2", status: "active", balance: 30000 },
    ];
    mockUseQuery.mockReturnValue({ data: cards, isLoading: false });

    render(<CardSection {...defaultProps} />);
    const panel = screen.getByTestId("station-cards-panel");
    expect(panel.getAttribute("data-count")).toBe("2");
  });

  it("shows loading state in StationCardsPanel", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<CardSection {...defaultProps} />);
    const panel = screen.getByTestId("station-cards-panel");
    expect(panel.getAttribute("data-loading")).toBe("true");
  });

  it("does not show SyncConflictDialog when no conflict", () => {
    render(<CardSection {...defaultProps} />);
    expect(screen.queryByTestId("sync-conflict-dialog")).toBeNull();
  });

  it("shows SyncConflictDialog when there is a conflict", () => {
    mockUseTenantSync.mockReturnValue({
      status: "conflict",
      conflict: { type: "slug_only", existingSlug: "taken" },
      retryWithChanges: vi.fn(),
      reset: vi.fn(),
    });

    render(<CardSection {...defaultProps} />);
    expect(screen.getByTestId("sync-conflict-dialog")).toBeDefined();
  });
});
