import { describe, it, expect, beforeEach, vi } from "vitest";
import { addSyncLog, getSyncLogs, clearSyncLogs, subscribeSyncLogs } from "../syncLogStore";

describe("syncLogStore", () => {
  beforeEach(() => {
    clearSyncLogs();
  });

  describe("addSyncLog", () => {
    it("adds a log entry with correct fields", () => {
      addSyncLog("info", "Test message");
      const logs = getSyncLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe("info");
      expect(logs[0].message).toBe("Test message");
      expect(logs[0].id).toMatch(/^sync-log-\d+$/);
      expect(logs[0].timestamp).toBeGreaterThan(0);
    });

    it("adds entry with optional details", () => {
      addSyncLog("error", "Failed", "some details");
      const logs = getSyncLogs();
      expect(logs[0].details).toBe("some details");
    });

    it("adds entry without details when not provided", () => {
      addSyncLog("warn", "Warning");
      const logs = getSyncLogs();
      expect(logs[0].details).toBeUndefined();
    });

    it("newest entries appear first", () => {
      addSyncLog("info", "first");
      addSyncLog("info", "second");
      const logs = getSyncLogs();
      expect(logs[0].message).toBe("second");
      expect(logs[1].message).toBe("first");
    });

    it("caps at 100 entries", () => {
      for (let i = 0; i < 110; i++) {
        addSyncLog("info", `msg-${i}`);
      }
      const logs = getSyncLogs();
      expect(logs.length).toBe(100);
      // Most recent should be msg-109
      expect(logs[0].message).toBe("msg-109");
    });

    it("supports all log levels", () => {
      addSyncLog("info", "i");
      addSyncLog("warn", "w");
      addSyncLog("error", "e");
      const logs = getSyncLogs();
      expect(logs.map((l) => l.level)).toEqual(["error", "warn", "info"]);
    });
  });

  describe("getSyncLogs", () => {
    it("returns empty array initially", () => {
      expect(getSyncLogs()).toEqual([]);
    });

    it("returns readonly array", () => {
      addSyncLog("info", "test");
      const logs = getSyncLogs();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe("clearSyncLogs", () => {
    it("removes all entries", () => {
      addSyncLog("info", "a");
      addSyncLog("info", "b");
      clearSyncLogs();
      expect(getSyncLogs()).toEqual([]);
    });

    it("notifies listeners", () => {
      const listener = vi.fn();
      subscribeSyncLogs(listener);
      addSyncLog("info", "test");
      listener.mockClear();
      clearSyncLogs();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscribeSyncLogs", () => {
    it("notifies listener on addSyncLog", () => {
      const listener = vi.fn();
      subscribeSyncLogs(listener);
      addSyncLog("info", "hello");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies listener on clearSyncLogs", () => {
      const listener = vi.fn();
      subscribeSyncLogs(listener);
      clearSyncLogs();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsub = subscribeSyncLogs(listener);
      addSyncLog("info", "a");
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      addSyncLog("info", "b");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("supports multiple listeners", () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      subscribeSyncLogs(l1);
      subscribeSyncLogs(l2);
      addSyncLog("info", "test");
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });
  });
});
