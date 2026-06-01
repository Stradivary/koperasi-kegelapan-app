// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../lib/logger";

describe("logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("info", () => {
    it("logs JSON with level info to console.log", () => {
      logger.info("test message");
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(entry.level).toBe("info");
      expect(entry.msg).toBe("test message");
      expect(entry.ts).toBeDefined();
    });

    it("includes context fields", () => {
      logger.info("with context", { tenantId: "t1", count: 5 });
      const entry = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(entry.tenantId).toBe("t1");
      expect(entry.count).toBe(5);
    });
  });

  describe("debug", () => {
    it("logs JSON with level debug to console.log", () => {
      logger.debug("debug msg");
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(entry.level).toBe("debug");
      expect(entry.msg).toBe("debug msg");
    });

    it("includes context fields", () => {
      logger.debug("detail", { key: "val" });
      const entry = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(entry.key).toBe("val");
    });
  });

  describe("warn", () => {
    it("logs JSON with level warn to console.warn", () => {
      logger.warn("warning");
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(consoleSpy.warn.mock.calls[0][0]);
      expect(entry.level).toBe("warn");
      expect(entry.msg).toBe("warning");
    });

    it("includes context fields", () => {
      logger.warn("mismatch", { a: 1, b: 2 });
      const entry = JSON.parse(consoleSpy.warn.mock.calls[0][0]);
      expect(entry.a).toBe(1);
      expect(entry.b).toBe(2);
    });
  });

  describe("error", () => {
    it("logs JSON with level error to console.error", () => {
      logger.error("failure");
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(consoleSpy.error.mock.calls[0][0]);
      expect(entry.level).toBe("error");
      expect(entry.msg).toBe("failure");
    });

    it("includes context fields", () => {
      logger.error("db failed", { error: "timeout", query: "SELECT" });
      const entry = JSON.parse(consoleSpy.error.mock.calls[0][0]);
      expect(entry.error).toBe("timeout");
      expect(entry.query).toBe("SELECT");
    });
  });

  describe("timestamp format", () => {
    it("produces ISO 8601 timestamp", () => {
      logger.info("ts test");
      const entry = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("without context", () => {
    it("works without context parameter", () => {
      logger.info("no ctx");
      const entry = JSON.parse(consoleSpy.log.mock.calls[0][0]);
      expect(Object.keys(entry)).toEqual(expect.arrayContaining(["ts", "level", "msg"]));
    });
  });
});
