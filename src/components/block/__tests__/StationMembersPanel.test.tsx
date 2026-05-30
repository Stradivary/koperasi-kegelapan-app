// @vitest-environment jsdom
/**
 * Tests for StationMembersPanel.tsx
 * Covers: lines 45-94 (cell components), 121-140 (columns + panel body),
 *         170-292 (renderMobileItem, dialogs, dropdown)
 */
import { createElement } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StationMembersPanel, type StationMemberRow } from "../StationMembersPanel";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// DataTable mock: renders header, mobile items, AND column cells
vi.mock("../data-table", () => ({
  DataTable: ({ data, columns, renderMobileItem, header, emptyState, showSearch }: any) => {
    const rows = data.map((row: any) => {
      const original = row;
      const cells = columns.map((col: any, idx: number) => {
        if (!col.cell) return null;
        const value = col.accessorKey ? original[col.accessorKey] : undefined;
        const info = { getValue: () => value, row: { original } };
        return createElement("td", { key: idx }, col.cell(info));
      });
      return createElement(
        "tr",
        { key: row.userId },
        ...cells,
        createElement("td", { key: "mobile" }, renderMobileItem?.({ original: row })),
      );
    });
    return createElement(
      "div",
      { "data-testid": "data-table" },
      header,
      showSearch && createElement("input", { "data-testid": "search-input" }),
      data.length === 0
        ? emptyState
        : createElement("table", undefined, createElement("tbody", undefined, ...rows)),
    );
  },
}));

vi.mock("../../ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: ({ open, onOpenChange, onConfirm, onCancel, description }: any) => {
    if (!open) return null;
    return createElement(
      "div",
      { "data-testid": "confirm-dialog" },
      description,
      createElement("button", { onClick: onConfirm, "data-testid": "confirm-btn" }, "Confirm"),
      createElement("button", { onClick: onCancel, "data-testid": "cancel-btn" }, "Cancel"),
      createElement(
        "button",
        { onClick: () => onOpenChange(false), "data-testid": "close-btn" },
        "Close",
      ),
    );
  },
}));

vi.mock("../../ui/prompt-dialog-drawer", () => ({
  PromptDialogDrawer: ({ open, onConfirm, validate }: any) => {
    if (!open) return null;
    const err = validate?.("");
    return createElement(
      "div",
      { "data-testid": "prompt-dialog" },
      err && createElement("span", { "data-testid": "validation-error" }, err),
      createElement(
        "button",
        { onClick: () => onConfirm("Ahmad Rifai"), "data-testid": "prompt-confirm" },
        "Confirm",
      ),
    );
  },
}));

vi.mock("../../ui/button", () => ({
  Button: ({ children, onClick, disabled }: any) =>
    createElement("button", { onClick, disabled }, children),
}));

vi.mock("../../ui/badge", () => ({
  Badge: ({ children, variant }: any) =>
    createElement("span", { "data-testid": "badge", "data-variant": variant }, children),
}));

vi.mock("../../ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => createElement("div", undefined, children),
  DropdownMenuContent: ({ children }: any) =>
    createElement("div", { "data-testid": "dropdown" }, children),
  DropdownMenuItem: ({ children, onClick, disabled, variant }: any) =>
    createElement(
      "div",
      { onClick, "data-disabled": disabled ? "" : undefined, "data-variant": variant },
      children,
    ),
  DropdownMenuSeparator: () => createElement("hr"),
  DropdownMenuTrigger: ({ children }: any) => children,
}));

vi.mock("lucide-react", () => ({
  Ban: () => createElement("span"),
  CheckCircle2: () => createElement("span", { "data-testid": "check-icon" }),
  Clock: () => createElement("span", { "data-testid": "clock-icon" }),
  MoreHorizontal: () => createElement("span"),
  Plus: () => createElement("span"),
  Trash: () => createElement("span"),
  UserCheck: () => createElement("span"),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const activeMember: StationMemberRow = {
  userId: "u1",
  name: "Alice",
  status: "active",
  syncStatus: "synced",
};
const suspendedMember: StationMemberRow = {
  userId: "u2",
  name: "Bob",
  status: "suspended",
  syncStatus: "pending",
};

const defaultProps = {
  members: [activeMember, suspendedMember],
  isLoading: false,
  isCreating: false,
  isToggling: false,
  onCreateMember: vi.fn().mockResolvedValue(undefined),
  onToggleStatus: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Cell components (lines 45-94) ─────────────────────────────────────────────

describe("StationMembersPanel — cell components", () => {
  it("MemberNameCell renders name in bold", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
  });

  it("MemberIdCell renders userId with # prefix", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("#u1").length).toBeGreaterThan(0);
  });

  it("MemberStatusCell renders 'Aktif' for active status", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Aktif").length).toBeGreaterThan(0);
  });

  it("MemberStatusCell renders 'Ditangguhkan' for suspended status", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Ditangguhkan").length).toBeGreaterThan(0);
  });

  it("MemberSyncCell renders 'Synced' for synced members", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Synced").length).toBeGreaterThan(0);
  });

  it("MemberSyncCell renders 'Pending' for pending members", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });
});

// ── Mobile item rendering (lines 170-210) ─────────────────────────────────────

describe("StationMembersPanel — mobile item rendering", () => {
  it("renders member name in mobile item", () => {
    render(createElement(StationMembersPanel, defaultProps));
    // Mobile items also render the name
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(1);
  });

  it("renders userId in mobile item", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("#u1").length).toBeGreaterThan(0);
  });

  it("renders CheckCircle2 icon for synced members in mobile", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByTestId("check-icon").length).toBeGreaterThan(0);
  });

  it("renders Clock icon for pending members in mobile", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByTestId("clock-icon").length).toBeGreaterThan(0);
  });

  it("renders first letter avatar for active member", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("A").length).toBeGreaterThan(0); // Alice's initial
  });

  it("renders status badge in mobile item", () => {
    render(createElement(StationMembersPanel, defaultProps));
    const badges = screen.getAllByTestId("badge");
    const activeLabels = badges.filter((b) => b.textContent === "Aktif");
    expect(activeLabels.length).toBeGreaterThan(0);
  });
});

// ── Actions dropdown (lines 240-292) ──────────────────────────────────────────

describe("StationMembersPanel — actions dropdown", () => {
  it("shows 'Tangguhkan' for active members", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Tangguhkan").length).toBeGreaterThan(0);
  });

  it("shows 'Aktifkan' for suspended members", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.getAllByText("Aktifkan").length).toBeGreaterThan(0);
  });

  it("calls onToggleStatus when Tangguhkan clicked", () => {
    render(createElement(StationMembersPanel, defaultProps));
    const tangguhkanBtns = screen.getAllByText("Tangguhkan");
    fireEvent.click(tangguhkanBtns[0]);
    expect(defaultProps.onToggleStatus).toHaveBeenCalledWith("u1", "active");
  });

  it("calls onToggleStatus when Aktifkan clicked", () => {
    render(createElement(StationMembersPanel, defaultProps));
    const aktifkanBtns = screen.getAllByText("Aktifkan");
    fireEvent.click(aktifkanBtns[0]);
    expect(defaultProps.onToggleStatus).toHaveBeenCalledWith("u2", "suspended");
  });

  it("shows Hapus Member when onDeleteMember is provided", () => {
    render(createElement(StationMembersPanel, { ...defaultProps, onDeleteMember: vi.fn() }));
    expect(screen.getAllByText("Hapus Member").length).toBeGreaterThan(0);
  });

  it("does not show Hapus Member when onDeleteMember is not provided", () => {
    render(createElement(StationMembersPanel, defaultProps));
    expect(screen.queryByText("Hapus Member")).toBeNull();
  });

  it("disables toggle when isToggling=true", () => {
    render(createElement(StationMembersPanel, { ...defaultProps, isToggling: true }));
    const tangguhkanBtns = screen.getAllByText("Tangguhkan");
    expect(tangguhkanBtns[0].closest("[data-disabled]")).not.toBeNull();
  });

  it("disables delete when isDeleting=true", () => {
    render(
      createElement(StationMembersPanel, {
        ...defaultProps,
        onDeleteMember: vi.fn(),
        isDeleting: true,
      }),
    );
    const deleteBtns = screen.getAllByText("Hapus Member");
    expect(deleteBtns[0].closest("[data-disabled]")).not.toBeNull();
  });
});

// ── Add member dialog (lines 121-140) ─────────────────────────────────────────

describe("StationMembersPanel — add member dialog", () => {
  it("opens prompt dialog when Tambah Anggota clicked", () => {
    render(createElement(StationMembersPanel, defaultProps));
    fireEvent.click(screen.getByText("Tambah Anggota"));
    expect(screen.getByTestId("prompt-dialog")).toBeDefined();
  });

  it("calls onCreateMember with name when confirmed", async () => {
    render(createElement(StationMembersPanel, defaultProps));
    fireEvent.click(screen.getByText("Tambah Anggota"));
    fireEvent.click(screen.getByTestId("prompt-confirm"));
    expect(defaultProps.onCreateMember).toHaveBeenCalledWith("Ahmad Rifai");
  });

  it("validates empty name", () => {
    render(createElement(StationMembersPanel, defaultProps));
    fireEvent.click(screen.getByText("Tambah Anggota"));
    expect(screen.getByTestId("validation-error").textContent).toContain("kosong");
  });
});

// ── Delete member dialog (lines 215-240) ──────────────────────────────────────

describe("StationMembersPanel — delete member dialog", () => {
  it("opens delete dialog when Hapus Member clicked", () => {
    const onDeleteMember = vi.fn();
    render(createElement(StationMembersPanel, { ...defaultProps, onDeleteMember }));
    const deleteBtns = screen.getAllByText("Hapus Member");
    fireEvent.click(deleteBtns[0]);
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
  });

  it("calls onDeleteMember on confirm", () => {
    const onDeleteMember = vi.fn();
    render(createElement(StationMembersPanel, { ...defaultProps, onDeleteMember }));
    const deleteBtns = screen.getAllByText("Hapus Member");
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByTestId("confirm-btn"));
    expect(onDeleteMember).toHaveBeenCalledWith("u1");
  });

  it("closes dialog on cancel without calling onDeleteMember", () => {
    const onDeleteMember = vi.fn();
    render(createElement(StationMembersPanel, { ...defaultProps, onDeleteMember }));
    const deleteBtns = screen.getAllByText("Hapus Member");
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(onDeleteMember).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("closes dialog via onOpenChange(false)", () => {
    const onDeleteMember = vi.fn();
    render(createElement(StationMembersPanel, { ...defaultProps, onDeleteMember }));
    const deleteBtns = screen.getAllByText("Hapus Member");
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByTestId("close-btn"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("shows member name in delete dialog description", () => {
    const onDeleteMember = vi.fn();
    render(createElement(StationMembersPanel, { ...defaultProps, onDeleteMember }));
    const deleteBtns = screen.getAllByText("Hapus Member");
    fireEvent.click(deleteBtns[0]);
    expect(screen.getByText(/"Alice"/)).toBeDefined();
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe("StationMembersPanel — empty state", () => {
  it("shows empty state when no members", () => {
    render(createElement(StationMembersPanel, { ...defaultProps, members: [] }));
    expect(screen.getByText("Belum ada anggota terdaftar")).toBeDefined();
  });
});
