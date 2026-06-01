// @vitest-environment jsdom
/**
 * Tests for src/components/block/StationCardsPanel.tsx
 * Covers: renders StationCardListPanel, exposes goToList via ref
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("#/components/block/StationCardListPanel", () => ({
  StationCardListPanel: ({
    cards,
    isLoading,
  }: {
    cards: { cardId: string }[];
    isLoading: boolean;
    isRecovering?: boolean;
    isDeleting?: boolean;
    onTopupCard?: () => void;
    onRecoverCard?: () => void;
    onDeleteCard?: () => void;
    onIssueNew?: () => void;
  }) => (
    <div data-testid="card-list-panel" data-count={cards.length} data-loading={String(isLoading)} />
  ),
}));

import { StationCardsPanel } from "#/components/block/StationCardsPanel";
import type { StationCardRow, StationUserRow } from "#/components/block/StationCardsPanel";

const cards: StationCardRow[] = [
  {
    cardId: "abc",
    userId: "u-1",
    userName: "Budi",
    balance: 10000,
    status: "active",
    syncStatus: "synced",
    counter: 1,
    expiresAt: null,
  },
];
const members: StationUserRow[] = [
  { userId: "u-1", name: "Budi", status: "active", syncStatus: "synced" },
];

function defaultProps(overrides = {}) {
  return {
    cards,
    members,
    isLoading: false,
    isTopping: false,
    isIssuing: false,
    isRecovering: false,
    isDeleting: false,
    hasGrant: true,
    onTopupCard: vi.fn(),
    onRecoverCard: vi.fn(),
    onIssueNew: vi.fn(),
    onDeleteCard: vi.fn(),
    ...overrides,
  };
}

describe("StationCardsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders StationCardListPanel", () => {
    render(<StationCardsPanel {...defaultProps()} />);
    expect(screen.getByTestId("card-list-panel")).toBeDefined();
  });

  it("passes cards count to StationCardListPanel", () => {
    render(<StationCardsPanel {...defaultProps()} />);
    expect(screen.getByTestId("card-list-panel").getAttribute("data-count")).toBe("1");
  });

  it("passes isLoading to StationCardListPanel", () => {
    render(<StationCardsPanel {...defaultProps({ isLoading: true })} />);
    expect(screen.getByTestId("card-list-panel").getAttribute("data-loading")).toBe("true");
  });

  it("exposes goToList via imperative ref", () => {
    const ref = React.createRef<{ goToList: () => void }>();
    render(<StationCardsPanel {...defaultProps()} ref={ref} />);
    expect(typeof ref.current?.goToList).toBe("function");
    // Should not throw
    expect(() => ref.current?.goToList()).not.toThrow();
  });
});
