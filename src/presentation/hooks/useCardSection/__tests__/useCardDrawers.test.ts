// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardDrawers } from "../useCardDrawers";

describe("useCardDrawers", () => {
  it("returns all initial states as false/null", () => {
    const { result } = renderHook(() => useCardDrawers());

    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.topupDrawerOpen).toBe(false);
    expect(result.current.topupTargetCardId).toBeNull();
    expect(result.current.recoveryDrawerOpen).toBe(false);
    expect(result.current.fixCardId).toBeNull();
    expect(result.current.showFixCard).toBe(false);
    expect(result.current.issueCardDrawerOpen).toBe(false);
    expect(result.current.overwriteDialog).toBeNull();
    expect(result.current.notBlankDialog).toBeNull();
  });

  describe("openTopupDrawer / closeTopupDrawer", () => {
    it("sets topupTargetCardId and opens drawer", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openTopupDrawer("card-123");
      });

      expect(result.current.topupDrawerOpen).toBe(true);
      expect(result.current.topupTargetCardId).toBe("card-123");
    });

    it("closes drawer and clears target card id", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openTopupDrawer("card-123");
      });
      act(() => {
        result.current.closeTopupDrawer();
      });

      expect(result.current.topupDrawerOpen).toBe(false);
      expect(result.current.topupTargetCardId).toBeNull();
    });
  });

  describe("openRecoveryDrawer / closeRecoveryDrawer", () => {
    it("opens recovery drawer", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openRecoveryDrawer();
      });

      expect(result.current.recoveryDrawerOpen).toBe(true);
    });

    it("closes recovery drawer", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openRecoveryDrawer();
      });
      act(() => {
        result.current.closeRecoveryDrawer();
      });

      expect(result.current.recoveryDrawerOpen).toBe(false);
    });
  });

  describe("openFixCard / closeFixCard", () => {
    it("sets fixCardId and shows fix card", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openFixCard("card-456");
      });

      expect(result.current.fixCardId).toBe("card-456");
      expect(result.current.showFixCard).toBe(true);
    });

    it("accepts null cardId", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openFixCard(null);
      });

      expect(result.current.fixCardId).toBeNull();
      expect(result.current.showFixCard).toBe(true);
    });

    it("closes fix card and clears id", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openFixCard("card-456");
      });
      act(() => {
        result.current.closeFixCard();
      });

      expect(result.current.fixCardId).toBeNull();
      expect(result.current.showFixCard).toBe(false);
    });
  });

  describe("openIssueCardDrawer / closeIssueCardDrawer", () => {
    it("opens issue card drawer", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openIssueCardDrawer();
      });

      expect(result.current.issueCardDrawerOpen).toBe(true);
    });

    it("closes issue card drawer", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.openIssueCardDrawer();
      });
      act(() => {
        result.current.closeIssueCardDrawer();
      });

      expect(result.current.issueCardDrawerOpen).toBe(false);
    });
  });

  describe("direct setters", () => {
    it("setIsDrawerOpen toggles drawer state", () => {
      const { result } = renderHook(() => useCardDrawers());

      act(() => {
        result.current.setIsDrawerOpen(true);
      });
      expect(result.current.isDrawerOpen).toBe(true);

      act(() => {
        result.current.setIsDrawerOpen(false);
      });
      expect(result.current.isDrawerOpen).toBe(false);
    });

    it("setOverwriteDialog sets dialog state", () => {
      const { result } = renderHook(() => useCardDrawers());

      const dialog = {
        existingCard: {
          cardId: "c-1",
          ownerName: "Test",
          userId: "u-1",
          balance: 5000,
          status: "active",
        },
        pendingIssue: { name: "New", userId: null, balance: 0, expiresAt: null },
      };

      act(() => {
        result.current.setOverwriteDialog(dialog);
      });

      expect(result.current.overwriteDialog).toEqual(dialog);
    });

    it("setNotBlankDialog sets dialog state", () => {
      const { result } = renderHook(() => useCardDrawers());

      const dialog = {
        cardSerial: "serial-123",
        pendingIssue: { name: "Test", userId: "u-1", balance: 100, expiresAt: null },
      };

      act(() => {
        result.current.setNotBlankDialog(dialog);
      });

      expect(result.current.notBlankDialog).toEqual(dialog);
    });
  });
});
