// @vitest-environment jsdom
/**
 * Tests for src/components/section/MemberSection.tsx
 * Covers: query/mutation wiring, createMember, toggleStatus, deleteMember,
 *         generateMemberId, toast calls, syncEngine notification.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock react-query ──────────────────────────────────────────────────────────

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockUseQueryClient = vi.fn(() => ({ invalidateQueries: mockInvalidateQueries }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

// ── Mock sonner ───────────────────────────────────────────────────────────────

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// ── Mock localDb ──────────────────────────────────────────────────────────────

vi.mock("#/presentation/hooks/useLocalDb", () => ({
  localDb: {
    users: {
      where: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
    },
    cards: {
      where: vi.fn(),
    },
  },
}));

// Resolved after mock is registered
import { localDb as _localDb } from "#/presentation/hooks/useLocalDb";

// Cast to mock type so vi.fn() methods are accessible without TS errors
const mockLocalDb = _localDb as unknown as {
  users: {
    where: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  cards: {
    where: ReturnType<typeof vi.fn>;
  };
};

// ── Mock SyncEngineContext ────────────────────────────────────────────────────

const mockNotifyMutation = vi.fn();
const mockUseSyncEngineContext = vi.fn();

vi.mock("#/presentation/hooks/SyncEngineContext", () => ({
  useSyncEngineContext: () => mockUseSyncEngineContext(),
}));

// ── Mock StationMembersPanel ──────────────────────────────────────────────────

const mockStationMembersPanel = vi.fn();

vi.mock("#/presentation/components/block/StationMembersPanel", () => ({
  StationMembersPanel: (props: unknown) => {
    mockStationMembersPanel(props);
    return <div data-testid="station-members-panel" />;
  },
}));

import { MemberSection } from "#/presentation/components/section/MemberSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupMocks(
  overrides: {
    queryData?: unknown[];
    queryLoading?: boolean;
    mutationPending?: boolean;
  } = {},
) {
  const { queryData = [], queryLoading = false, mutationPending = false } = overrides;

  mockUseQuery.mockReturnValue({
    data: queryData,
    isLoading: queryLoading,
  });

  // useMutation returns an object with mutate, mutateAsync, isPending
  // We capture the options passed to useMutation so we can call them in tests
  mockUseMutation.mockImplementation(
    (opts: {
      mutationFn: (...args: unknown[]) => Promise<unknown>;
      onSuccess?: () => void;
      onError?: (e: Error) => void;
    }) => ({
      mutate: vi.fn(async (vars: unknown) => {
        try {
          await opts.mutationFn(vars);
          opts.onSuccess?.();
        } catch (e) {
          opts.onError?.(e as Error);
        }
      }),
      mutateAsync: vi.fn(async (vars: unknown) => {
        await opts.mutationFn(vars);
        opts.onSuccess?.();
      }),
      isPending: mutationPending,
    }),
  );

  mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemberSection - rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders StationMembersPanel", () => {
    render(<MemberSection tenantId="t-1" />);
    expect(screen.getByTestId("station-members-panel")).toBeDefined();
  });

  it("passes members data to StationMembersPanel", () => {
    const members = [{ userId: "u-1", name: "Budi", status: "active", syncStatus: "synced" }];
    setupMocks({ queryData: members });
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(call.members).toEqual(members);
  });

  it("passes empty array when query data is undefined", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(call.members).toEqual([]);
  });

  it("passes isLoading to StationMembersPanel", () => {
    setupMocks({ queryLoading: true });
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(call.isLoading).toBe(true);
  });

  it("passes isCreating=true when createMember mutation is pending", () => {
    setupMocks({ mutationPending: true });
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(call.isCreating).toBe(true);
  });
});

describe("MemberSection - useQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("calls useQuery with correct queryKey", () => {
    render(<MemberSection tenantId="t-1" />);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["users", "t-1"] }),
    );
  });

  it("queryFn filters out deleted users and maps to StationUserRow", async () => {
    const rawUsers = [
      { userId: "u-1", name: "Budi", status: "active", syncStatus: "synced" },
      { userId: "u-2", name: "Sari", status: "deleted", syncStatus: "synced" },
    ];

    const mockToArray = vi.fn().mockResolvedValue(rawUsers);
    mockLocalDb.users.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({ toArray: mockToArray }),
    });

    let capturedQueryFn: (() => Promise<unknown>) | null = null;
    mockUseQuery.mockImplementation((opts: { queryFn: () => Promise<unknown> }) => {
      capturedQueryFn = opts.queryFn;
      return { data: [], isLoading: false };
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    const result = await capturedQueryFn!();
    expect(result).toEqual([
      { userId: "u-1", name: "Budi", status: "active", syncStatus: "synced" },
    ]);
  });
});

describe("MemberSection - createMember mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mutationFn adds user to localDb", async () => {
    (mockLocalDb.users.add as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Capture all mutation calls; createMember is the 1st (index 0)
    const mutationCalls: Array<{
      mutationFn: (v: unknown) => Promise<unknown>;
      onSuccess?: () => void;
      onError?: (e: Error) => void;
    }> = [];
    mockUseMutation.mockImplementation((opts: (typeof mutationCalls)[0]) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    await mutationCalls[0].mutationFn({ name: "  Ahmad  " });

    expect(mockLocalDb.users.add).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        name: "Ahmad",
        status: "active",
        syncStatus: "pending",
      }),
    );
  });

  it("onSuccess shows toast and invalidates queries", async () => {
    const mutationCalls: Array<{ onSuccess?: () => void }> = [];
    mockUseMutation.mockImplementation((opts: { onSuccess?: () => void }) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    // createMember is the 1st mutation (index 0)
    mutationCalls[0].onSuccess?.();

    expect(mockToastSuccess).toHaveBeenCalledWith("Anggota berhasil ditambahkan");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["users", "t-1"] });
    expect(mockNotifyMutation).toHaveBeenCalled();
  });

  it("onError shows toast with error message", async () => {
    const mutationCalls: Array<{ onError?: (e: Error) => void }> = [];
    mockUseMutation.mockImplementation((opts: { onError?: (e: Error) => void }) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    // createMember is the 1st mutation (index 0)
    mutationCalls[0].onError?.(new Error("DB write failed"));

    expect(mockToastError).toHaveBeenCalledWith("DB write failed");
  });

  it("mutationFn throws when localDb.add fails", async () => {
    (mockLocalDb.users.add as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Quota exceeded"),
    );

    const mutationCalls: Array<{ mutationFn: (v: unknown) => Promise<unknown> }> = [];
    mockUseMutation.mockImplementation((opts: { mutationFn: (v: unknown) => Promise<unknown> }) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    await expect(mutationCalls[0].mutationFn({ name: "Test" })).rejects.toThrow("Quota exceeded");
  });
});

describe("MemberSection - toggleMemberStatus mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("onSuccess invalidates users and station-cards queries", async () => {
    const mutationCalls: Array<{ onSuccess?: () => void }> = [];
    mockUseMutation.mockImplementation((opts: { onSuccess?: () => void }) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    // Second useMutation call is toggleMemberStatus
    mutationCalls[1]?.onSuccess?.();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["users", "t-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["station-cards", "t-1"] });
    expect(mockNotifyMutation).toHaveBeenCalled();
  });
});

describe("MemberSection - deleteMember mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("onSuccess shows toast and invalidates queries", async () => {
    const mutationCalls: Array<{ onSuccess?: () => void }> = [];
    mockUseMutation.mockImplementation((opts: { onSuccess?: () => void }) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    // Third useMutation call is deleteMember
    mutationCalls[2]?.onSuccess?.();

    expect(mockToastSuccess).toHaveBeenCalledWith("Anggota berhasil dihapus");
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["users", "t-1"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["station-cards", "t-1"] });
  });

  it("onError shows toast with error message", async () => {
    const mutationCalls: Array<{ onError?: (e: Error) => void }> = [];
    mockUseMutation.mockImplementation((opts: { onError?: (e: Error) => void }) => {
      mutationCalls.push(opts);
      return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    mutationCalls[2]?.onError?.(new Error("Delete failed"));

    expect(mockToastError).toHaveBeenCalledWith("Delete failed");
  });
});

describe("MemberSection - prop callbacks wired to StationMembersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("passes onCreateMember callback", () => {
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(typeof call.onCreateMember).toBe("function");
  });

  it("passes onToggleStatus callback", () => {
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(typeof call.onToggleStatus).toBe("function");
  });

  it("passes onDeleteMember callback", () => {
    render(<MemberSection tenantId="t-1" />);
    const call = mockStationMembersPanel.mock.calls[0][0];
    expect(typeof call.onDeleteMember).toBe("function");
  });

  it("onToggleStatus toggles active -> suspended", () => {
    const mockMutate = vi.fn();
    mockUseMutation.mockImplementation((_opts: unknown, index?: number) => ({
      mutate: index === 1 ? mockMutate : vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }));

    // Re-setup with captured mutate for toggleMemberStatus (2nd mutation)
    const mutates: ReturnType<typeof vi.fn>[] = [];
    mockUseMutation.mockImplementation(() => {
      const m = vi.fn();
      mutates.push(m);
      return { mutate: m, mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    const call = mockStationMembersPanel.mock.calls[0][0];
    call.onToggleStatus("u-1", "active");

    // toggleMemberStatus.mutate should be called with suspended
    expect(mutates[1]).toHaveBeenCalledWith({ userId: "u-1", status: "suspended" });
  });

  it("onToggleStatus toggles suspended -> active", () => {
    const mutates: ReturnType<typeof vi.fn>[] = [];
    mockUseMutation.mockImplementation(() => {
      const m = vi.fn();
      mutates.push(m);
      return { mutate: m, mutateAsync: vi.fn(), isPending: false };
    });
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseSyncEngineContext.mockReturnValue({ notifyMutation: mockNotifyMutation });

    render(<MemberSection tenantId="t-1" />);

    const call = mockStationMembersPanel.mock.calls[0][0];
    call.onToggleStatus("u-2", "suspended");

    expect(mutates[1]).toHaveBeenCalledWith({ userId: "u-2", status: "active" });
  });
});
