// @vitest-environment jsdom
/**
 * Tests for src/components/block/StationCardIssuePanel.tsx
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/presentation/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type as "button" | "submit" | "reset" | undefined}
    >
      {children}
    </button>
  ),
}));

vi.mock("#/presentation/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("#/presentation/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

import { StationCardIssuePanel } from "#/presentation/components/block/StationCardIssuePanel";
import type { StationUserRow } from "#/presentation/components/block/StationCardsPanel";

const members: StationUserRow[] = [
  { userId: "u-1", name: "Budi", status: "active", syncStatus: "synced" },
  { userId: "u-2", name: "Sari", status: "suspended", syncStatus: "synced" },
];

describe("StationCardIssuePanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the form title", () => {
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Cetak Kartu Baru")).toBeDefined();
  });

  it("only shows active members in dropdown", () => {
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Budi (#u-1)")).toBeDefined();
    expect(screen.queryByText("Sari (#u-2)")).toBeNull();
  });

  it("shows scanning state when isIssuing is true", () => {
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={true}
        onIssueCard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Tempelkan kartu ke pembaca NFC...")).toBeDefined();
  });

  it("calls onCancel when Batal clicked", () => {
    const onCancel = vi.fn();
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Batal"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables issue button when name is empty", () => {
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const btn = screen.getByText("Cetak & Daftarkan").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  it("sets quick balance when preset button clicked", () => {
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("10k"));
    const input = screen.getByPlaceholderText("0") as HTMLInputElement;
    expect(input.value).toBe("10000");
  });

  it("auto-fills name when member selected", () => {
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "u-1" } });
    const nameInput = screen.getByPlaceholderText(
      "Nama lengkap pemegang kartu",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Budi");
  });

  it("shows error when onIssueCard rejects", async () => {
    const onIssueCard = vi.fn().mockRejectedValue(new Error("NFC failed"));
    render(
      <StationCardIssuePanel
        members={members}
        isIssuing={false}
        onIssueCard={onIssueCard}
        onCancel={vi.fn()}
      />,
    );
    // Set a name so button is enabled
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "u-1" } });
    fireEvent.click(screen.getByText("Cetak & Daftarkan"));
    await waitFor(() => {
      expect(screen.getByText("NFC failed")).toBeDefined();
    });
  });
});
