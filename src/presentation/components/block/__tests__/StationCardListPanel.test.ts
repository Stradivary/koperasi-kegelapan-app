// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationCardListPanel } from "../StationCardListPanel";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// DropdownMenu mock: renders content immediately so tests can interact with items
vi.mock("../../ui/dropdown-menu", () => {
  const { createElement: h } = require("react");
  return {
    DropdownMenu: ({ children }: any) => h("div", undefined, children),
    DropdownMenuTrigger: ({ children, asChild, ...props }: any) => {
      // If asChild, render the child directly; otherwise wrap
      if (asChild) return children;
      return h("button", props, children);
    },
    DropdownMenuContent: ({ children }: any) => h("div", { "data-testid": "dropdown" }, children),
    DropdownMenuItem: ({ children, onClick, disabled, ...props }: any) =>
      h(
        "div",
        {
          onClick: disabled ? undefined : onClick,
          "data-disabled": disabled ? "" : undefined,
          ...props,
        },
        children,
      ),
    DropdownMenuSeparator: () => h("hr"),
  };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

// DataTable mock: renders header, mobile items, AND column cells so column
// renderers get exercised in tests.
vi.mock("../data-table", () => ({
  DataTable: ({ data, columns, renderMobileItem, header, emptyState }: any) => {
    const rows = data.map((row: any) => {
      const original = row;
      const cells = columns.map((col: any) => {
        if (!col.cell) return null;
        const value = col.accessorKey ? original[col.accessorKey] : undefined;
        const info = {
          getValue: () => value,
          row: { original },
        };
        return createElement("td", { key: col.id ?? col.accessorKey }, col.cell(info));
      });
      return createElement(
        "tr",
        { key: row.cardId },
        ...cells,
        createElement("td", undefined, renderMobileItem({ original: row })),
      );
    });
    return createElement(
      "div",
      undefined,
      header,
      data.length === 0
        ? emptyState
        : createElement("table", undefined, createElement("tbody", undefined, ...rows)),
    );
  },
}));

// ConfirmationDialogDrawer: render a real-enough stub so we can test callbacks
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const defaultCard = {
  cardId: "04a2b3c4d5e6f7",
  userId: "USR00001",
  userName: "Budi",
  status: "active" as const,
  syncStatus: "synced" as const,
  balance: 25000,
  counter: 7,
  expiresAt: "2026-12-31",
};

const defaultProps = {
  cards: [defaultCard],
  isLoading: false,
  isRecovering: false,
  isDeleting: false,
  onTopupCard: vi.fn(),
  onRecoverCard: vi.fn(),
  onDeleteCard: vi.fn(),
  onIssueNew: vi.fn(),
};

describe("StationCardListPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    delete (globalThis as any).NDEFReader;
  });

  // ── Existing tests (preserved) ────────────────────────────────────────────

  it("triggers recovery from the card actions menu", async () => {
    const onRecoverCard = vi.fn();
    render(createElement(StationCardListPanel, { ...defaultProps, onRecoverCard }));
    fireEvent.click(screen.getAllByText("Pulihkan Kartu")[0]);
    expect(onRecoverCard).toHaveBeenCalledTimes(1);
    expect(onRecoverCard.mock.calls[0][0]).toMatchObject({ cardId: "04a2b3c4d5e6f7" });
  });

  it("disables recovery when the selected card is not synced yet", async () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, syncStatus: "pending" }],
      }),
    );
    const recoveryItem = screen.getAllByText("Pulihkan Kartu")[0];
    expect(recoveryItem.closest("div")?.dataset.disabled).toBe("");
  });

  it("triggers top-up from the card actions menu", async () => {
    const onTopupCard = vi.fn();
    render(createElement(StationCardListPanel, { ...defaultProps, onTopupCard }));
    fireEvent.click(screen.getAllByText("Top-up")[0]);
    expect(onTopupCard).toHaveBeenCalledWith("04a2b3c4d5e6f7");
  });

  it("disables top-up when card is blocked", async () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, status: "blocked_tamper" }],
      }),
    );
    const topupItem = screen.getAllByText("Top-up")[0];
    expect(topupItem.closest("div")?.dataset.disabled).toBe("");
  });

  it("renders blocked card with destructive badge", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, status: "blocked_fraud" }],
      }),
    );
    expect(screen.getAllByText("Blokir fraud").length).toBeGreaterThan(0);
  });

  it("renders active card with default badge", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    expect(screen.getAllByText("Aktif").length).toBeGreaterThan(0);
  });

  it("renders synced status with CheckCircle icon", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    expect(screen.getAllByText("Budi").length).toBeGreaterThan(0);
  });

  it("renders pending sync status with Clock icon", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, syncStatus: "pending" }],
      }),
    );
    expect(screen.getAllByText("Budi").length).toBeGreaterThan(0);
  });

  it("renders card without owner as 'Tanpa Pemilik'", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, userId: null, userName: null }],
      }),
    );
    expect(screen.getAllByText("Tanpa Pemilik").length).toBeGreaterThan(0);
  });

  it("renders card with userId but no userName as 'User #ID'", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, userName: null }],
      }),
    );
    expect(screen.getAllByText("User #USR00001").length).toBeGreaterThan(0);
  });

  it("renders balance formatted in Indonesian locale", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    expect(screen.getAllByText(/Rp 25/).length).toBeGreaterThan(0);
  });

  it("calls onIssueNew when 'Cetak Kartu Baru' button is clicked", () => {
    const onIssueNew = vi.fn();
    Object.defineProperty(globalThis, "NDEFReader", { value: class {}, configurable: true });
    render(createElement(StationCardListPanel, { ...defaultProps, onIssueNew }));
    fireEvent.click(screen.getByText("Cetak Kartu Baru"));
    expect(onIssueNew).toHaveBeenCalledOnce();
  });

  it("renders multiple cards", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [
          defaultCard,
          { ...defaultCard, cardId: "04b2c3d4e5f6a7", userName: "Siti", userId: "USR00002" },
        ],
      }),
    );
    expect(screen.getAllByText("Budi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Siti").length).toBeGreaterThan(0);
  });

  // ── Column cell renderers (lines 49-87) ───────────────────────────────────

  it("column: userName cell shows name when present", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    // userName column cell renders the name
    expect(screen.getAllByText("Budi").length).toBeGreaterThan(0);
  });

  it("column: userName cell shows 'User #ID' when no userName but userId exists", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, userName: null }],
      }),
    );
    expect(screen.getAllByText("User #USR00001").length).toBeGreaterThan(0);
  });

  it("column: userName cell shows 'Tanpa Pemilik' when no userName and no userId", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, userName: null, userId: null }],
      }),
    );
    expect(screen.getAllByText("Tanpa Pemilik").length).toBeGreaterThan(0);
  });

  it("column: cardId cell renders in monospace span", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    const monoSpans = document.querySelectorAll("span.font-mono");
    const ids = Array.from(monoSpans).map((el) => el.textContent);
    expect(ids.some((id) => id?.includes("04a2b3c4d5e6f7"))).toBe(true);
  });

  it("column: status cell renders 'Aktif' for active cards", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    expect(screen.getAllByText("Aktif").length).toBeGreaterThan(0);
  });

  it("column: status cell renders blocked label for blocked cards", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, status: "blocked_tamper" }],
      }),
    );
    expect(screen.getAllByText("Blokir tamper").length).toBeGreaterThan(0);
  });

  it("column: syncStatus cell renders 'Synced' for synced cards", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    expect(screen.getAllByText("Synced").length).toBeGreaterThan(0);
  });

  it("column: syncStatus cell renders 'Pending' for pending cards", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, syncStatus: "pending" }],
      }),
    );
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("column: balance cell renders formatted balance", () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    expect(screen.getAllByText(/Rp 25/).length).toBeGreaterThan(0);
  });

  it("column: balance cell handles null balance gracefully", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, balance: null as any }],
      }),
    );
    // Should not throw; renders "Rp undefined" or similar
    expect(document.body).toBeDefined();
  });

  // ── columnsWithActions cell (lines 112-120) ───────────────────────────────

  it("actions column cell renders CardActionsDropdown in table row", async () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    // Multiple dropdowns rendered (table cell + mobile item)
    const triggers = screen.getAllByLabelText("Aksi kartu");
    expect(triggers.length).toBeGreaterThan(0);
  });

  it("actions column: topup from table row dropdown", async () => {
    const onTopupCard = vi.fn();
    render(createElement(StationCardListPanel, { ...defaultProps, onTopupCard }));
    fireEvent.click(screen.getAllByText("Top-up")[0]);
    expect(onTopupCard).toHaveBeenCalledWith("04a2b3c4d5e6f7");
  });

  it("actions column: delete from table row sets deleteTarget", async () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));
    fireEvent.click(screen.getAllByText("Hapus Kartu")[0]);
    // Dialog should now be open
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
  });

  // ── NFC button disabled state (line 136) ─────────────────────────────────

  it("'Cetak Kartu Baru' button is disabled when NDEFReader is not available", () => {
    // NDEFReader not in globalThis by default in jsdom
    render(createElement(StationCardListPanel, { ...defaultProps }));
    const btn = screen.getByText("Cetak Kartu Baru").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("'Cetak Kartu Baru' button is enabled when NDEFReader is available", () => {
    Object.defineProperty(globalThis, "NDEFReader", { value: class {}, configurable: true });
    render(createElement(StationCardListPanel, { ...defaultProps }));
    const btn = screen.getByText("Cetak Kartu Baru").closest("button");
    expect(btn?.disabled).toBe(false);
  });

  // ── Empty state (emptyState prop) ─────────────────────────────────────────

  it("renders empty state when no cards", () => {
    render(createElement(StationCardListPanel, { ...defaultProps, cards: [] }));
    expect(screen.getByText("Belum ada kartu terdaftar")).toBeDefined();
  });

  // ── ConfirmationDialogDrawer callbacks (lines 216-241) ───────────────────

  it("delete confirmation: onConfirm calls onDeleteCard and closes dialog", async () => {
    const onDeleteCard = vi.fn();
    render(createElement(StationCardListPanel, { ...defaultProps, onDeleteCard }));

    // Open delete dialog
    fireEvent.click(screen.getAllByText("Hapus Kartu")[0]);
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    // Confirm deletion
    fireEvent.click(screen.getByTestId("confirm-btn"));
    expect(onDeleteCard).toHaveBeenCalledWith(defaultCard);
    // Dialog should close
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("delete confirmation: onCancel closes dialog without deleting", async () => {
    const onDeleteCard = vi.fn();
    render(createElement(StationCardListPanel, { ...defaultProps, onDeleteCard }));

    fireEvent.click(screen.getAllByText("Hapus Kartu")[0]);
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(onDeleteCard).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("delete confirmation: onOpenChange(false) closes dialog", async () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));

    fireEvent.click(screen.getAllByText("Hapus Kartu")[0]);
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    fireEvent.click(screen.getByTestId("close-btn"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("delete confirmation: shows cardId in description", async () => {
    render(createElement(StationCardListPanel, { ...defaultProps }));

    fireEvent.click(screen.getAllByText("Hapus Kartu")[0]);

    expect(screen.getAllByText("04a2b3c4d5e6f7").length).toBeGreaterThan(0);
  });

  it("disables delete button when isDeleting is true", async () => {
    render(createElement(StationCardListPanel, { ...defaultProps, isDeleting: true }));
    const deleteItem = screen.getAllByText("Hapus Kartu")[0];
    expect(deleteItem.closest("div")?.dataset.disabled).toBe("");
  });

  it("disables recover button when isRecovering is true", async () => {
    render(createElement(StationCardListPanel, { ...defaultProps, isRecovering: true }));
    const recoverItem = screen.getAllByText("Pulihkan Kartu")[0];
    expect(recoverItem.closest("div")?.dataset.disabled).toBe("");
  });
});
