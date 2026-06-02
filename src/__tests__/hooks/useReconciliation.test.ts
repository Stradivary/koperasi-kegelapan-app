// @vitest-environment jsdom
/**
 * Tests for src/hooks/useReconciliation.ts
 */
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPending = vi.fn();
const mockMarkSynced = vi.fn();
const mockGetReconciliationOutbox = vi.fn();

vi.mock("#/infrastructure/persistence/dexie/indexeddb.lazy", () => ({
  getReconciliationOutbox: () => mockGetReconciliationOutbox(),
}));

vi.mock("#/infrastructure/api/apiClient", () => ({
  API_BASE_URL: "http://localhost:8787",
}));

import { useReconciliation } from "#/presentation/hooks/useReconciliation";

describe("useReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReconciliationOutbox.mockResolvedValue({
      getPending: mockGetPending,
      markSynced: mockMarkSynced,
    });
    mockMarkSynced.mockResolvedValue(undefined);
    global.fetch = vi.fn();
  });

  it("initializes with idle status and zero pending count", () => {
    const { result } = renderHook(() => useReconciliation("t-1", 1));
    expect(result.current.status).toBe("idle");
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.lastSyncedAt).toBeNull();
  });

  describe("checkPending", () => {
    it("updates pendingCount from outbox", async () => {
      mockGetPending.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const { result } = renderHook(() => useReconciliation("t-1", 1));

      let count: number;
      await act(async () => {
        count = await result.current.checkPending();
      });

      expect(count!).toBe(2);
      expect(result.current.pendingCount).toBe(2);
      expect(mockGetPending).toHaveBeenCalledWith("t-1");
    });

    it("returns 0 when no pending events", async () => {
      mockGetPending.mockResolvedValue([]);

      const { result } = renderHook(() => useReconciliation("t-1", 1));

      let count: number;
      await act(async () => {
        count = await result.current.checkPending();
      });

      expect(count!).toBe(0);
      expect(result.current.pendingCount).toBe(0);
    });
  });

  describe("sync", () => {
    it("sets status to success when no pending events", async () => {
      mockGetPending.mockResolvedValue([]);

      const { result } = renderHook(() => useReconciliation("t-1", 1));

      await act(async () => {
        await result.current.sync();
      });

      expect(result.current.status).toBe("success");
    });

    it("sends events to API and marks them synced on success", async () => {
      const pendingEvents = [
        {
          tenantId: "t-1",
          cardId: "abc123",
          counter: 1,
          type: "debit",
          amount: 5000,
          balanceAfter: 45000,
          timestamp: 1700000000,
          hash: "deadbeef",
          idempotencyKey: "t-1:abc123:1",
          status: "pending",
          createdAt: 1700000000,
          attempts: 0,
        },
      ];
      mockGetPending.mockResolvedValue(pendingEvents);
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accepted: 1, rejected: 0, flags: [] }),
      });

      const { result } = renderHook(() => useReconciliation("t-1", 1));

      await act(async () => {
        await result.current.sync();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8787/api/reconcile",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.terminalId).toBe(1);
      expect(body.events).toHaveLength(1);
      // Should strip internal fields
      expect(body.events[0].status).toBeUndefined();
      expect(body.events[0].createdAt).toBeUndefined();
      expect(body.events[0].attempts).toBeUndefined();

      expect(mockMarkSynced).toHaveBeenCalledWith("t-1:abc123:1");
      expect(result.current.status).toBe("success");
      expect(result.current.pendingCount).toBe(0);
      expect(result.current.lastSyncedAt).not.toBeNull();
    });

    it("sets error status on API failure", async () => {
      mockGetPending.mockResolvedValue([
        {
          tenantId: "t-1",
          cardId: "abc123",
          counter: 1,
          type: "debit",
          amount: 5000,
          balanceAfter: 45000,
          timestamp: 1700000000,
          hash: "deadbeef",
          idempotencyKey: "t-1:abc123:1",
        },
      ]);
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: "Internal error" })),
      });

      const { result } = renderHook(() => useReconciliation("t-1", 1));

      await act(async () => {
        await result.current.sync();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Internal error");
    });

    it("sets error status on network failure", async () => {
      mockGetPending.mockResolvedValue([
        {
          tenantId: "t-1",
          cardId: "abc123",
          counter: 1,
          type: "debit",
          amount: 5000,
          balanceAfter: 45000,
          timestamp: 1700000000,
          hash: "deadbeef",
          idempotencyKey: "t-1:abc123:1",
        },
      ]);
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useReconciliation("t-1", 1));

      await act(async () => {
        await result.current.sync();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Network error");
    });
  });
});
