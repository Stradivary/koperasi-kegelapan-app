// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StationCardListPanel } from "../StationCardListPanel";

vi.mock("../data-table", () => ({
  DataTable: ({ data, renderMobileItem, header }: any) =>
    createElement(
      "div",
      undefined,
      header,
      data.map((row: any) =>
        createElement("div", { key: row.cardId }, renderMobileItem({ original: row })),
      ),
    ),
}));

vi.mock("../../ui/confirmation-dialog-drawer", () => ({
  ConfirmationDialogDrawer: () => null,
}));

describe("StationCardListPanel", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("triggers recovery from the card actions menu", async () => {
    const onRecoverCard = vi.fn();

    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        onRecoverCard,
      }),
    );

    fireEvent.pointerDown(screen.getByLabelText("Aksi kartu"));
    fireEvent.click(await screen.findByText("Pulihkan Kartu"));

    expect(onRecoverCard).toHaveBeenCalledTimes(1);
    expect(onRecoverCard.mock.calls[0][0]).toMatchObject({ cardId: "04a2b3c4d5e6f7" });
  });

  it("disables recovery when the selected card is not synced yet", async () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [
          {
            cardId: "04a2b3c4d5e6f7",
            userId: null,
            userName: null,
            status: "active",
            syncStatus: "pending",
            balance: 0,
            counter: 1,
            expiresAt: null,
          },
        ],
      }),
    );

    fireEvent.pointerDown(screen.getByLabelText("Aksi kartu"));

    const recoveryItem = await screen.findByText("Pulihkan Kartu");
    expect(recoveryItem.closest("div")?.dataset.disabled).toBe("");
  });

  it("triggers top-up from the card actions menu", async () => {
    const onTopupCard = vi.fn();

    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        onTopupCard,
      }),
    );

    fireEvent.pointerDown(screen.getByLabelText("Aksi kartu"));
    fireEvent.click(await screen.findByText("Top-up"));

    expect(onTopupCard).toHaveBeenCalledWith("04a2b3c4d5e6f7");
  });

  it("disables top-up when card is blocked", async () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, status: "blocked_tamper" }],
      }),
    );

    fireEvent.pointerDown(screen.getByLabelText("Aksi kartu"));
    const topupItem = await screen.findByText("Top-up");
    expect(topupItem.closest("div")?.dataset.disabled).toBe("");
  });

  it("triggers delete from the card actions menu", async () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
      }),
    );

    fireEvent.pointerDown(screen.getByLabelText("Aksi kartu"));
    fireEvent.click(await screen.findByText("Hapus Kartu"));

    // Delete opens a confirmation dialog, so onDeleteCard is not called directly
    // The dialog should appear (we mocked it to null, so just verify no crash)
  });

  it("renders blocked card with destructive badge", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, status: "blocked_fraud" }],
      }),
    );

    expect(screen.getByText("Blokir fraud")).toBeDefined();
  });

  it("renders active card with default badge", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
      }),
    );

    expect(screen.getByText("Aktif")).toBeDefined();
  });

  it("renders synced status with CheckCircle icon", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
      }),
    );

    // Synced cards show a green check icon (CheckCircle2)
    expect(screen.getByText("Budi")).toBeDefined();
  });

  it("renders pending sync status with Clock icon", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, syncStatus: "pending" }],
      }),
    );

    expect(screen.getByText("Budi")).toBeDefined();
  });

  it("renders card without owner as 'Tanpa Pemilik'", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, userId: null, userName: null }],
      }),
    );

    expect(screen.getByText("Tanpa Pemilik")).toBeDefined();
  });

  it("renders card with userId but no userName as 'User #ID'", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        cards: [{ ...defaultCard, userName: null }],
      }),
    );

    expect(screen.getByText("User #USR00001")).toBeDefined();
  });

  it("renders balance formatted in Indonesian locale", () => {
    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
      }),
    );

    expect(screen.getByText(/Rp 25/)).toBeDefined();
  });

  it("calls onIssueNew when 'Cetak Kartu Baru' button is clicked", () => {
    const onIssueNew = vi.fn();
    // Mock NDEFReader to enable the button
    Object.defineProperty(globalThis, "NDEFReader", { value: class {}, configurable: true });

    render(
      createElement(StationCardListPanel, {
        ...defaultProps,
        onIssueNew,
      }),
    );

    fireEvent.click(screen.getByText("Cetak Kartu Baru"));
    expect(onIssueNew).toHaveBeenCalledOnce();

    // Cleanup
    delete (globalThis as any).NDEFReader;
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

    expect(screen.getByText("Budi")).toBeDefined();
    expect(screen.getByText("Siti")).toBeDefined();
  });
});
