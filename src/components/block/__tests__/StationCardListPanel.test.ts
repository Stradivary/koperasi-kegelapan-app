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

  it("triggers recovery from the card actions menu", async () => {
    const onRecoverCard = vi.fn();

    render(
      createElement(StationCardListPanel, {
        cards: [
          {
            cardId: "04a2b3c4d5e6f7",
            userId: "USR00001",
            userName: "Budi",
            status: "active",
            syncStatus: "synced",
            balance: 25000,
            counter: 7,
            expiresAt: "2026-12-31",
          },
        ],
        isLoading: false,
        isRecovering: false,
        isDeleting: false,
        onTopupCard: vi.fn(),
        onRecoverCard,
        onDeleteCard: vi.fn(),
        onIssueNew: vi.fn(),
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
        isLoading: false,
        isRecovering: false,
        isDeleting: false,
        onTopupCard: vi.fn(),
        onRecoverCard: vi.fn(),
        onDeleteCard: vi.fn(),
        onIssueNew: vi.fn(),
      }),
    );

    fireEvent.pointerDown(screen.getByLabelText("Aksi kartu"));

    const recoveryItem = await screen.findByText("Pulihkan Kartu");
    expect(recoveryItem.closest("div")?.dataset.disabled).toBe("");
  });
});
