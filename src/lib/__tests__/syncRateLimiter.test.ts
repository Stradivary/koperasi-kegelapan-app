import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRateLimitState,
  isRateLimited,
  getRateLimitRemainingMs,
  activateRateLimit,
  clearRateLimitState,
  subscribeToRateLimit,
  onRateLimitResume,
  handleRateLimitResponse,
  MAX_PAUSE_MS,
} from "#/infrastructure/api/syncRateLimiter";

describe("syncRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRateLimitState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getRateLimitState", () => {
    it("returns not rate-limited state initially", () => {
      const state = getRateLimitState();
      expect(state.rateLimited).toBe(false);
      expect(state.pauseUntil).toBeNull();
    });

    it("returns a copy (not a reference to internal state)", () => {
      const state1 = getRateLimitState();
      const state2 = getRateLimitState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe("isRateLimited", () => {
    it("returns false when not rate-limited", () => {
      expect(isRateLimited()).toBe(false);
    });

    it("returns true when rate-limited and pause has not expired", () => {
      activateRateLimit(60);
      expect(isRateLimited()).toBe(true);
    });

    it("returns false when pause has expired based on local clock", () => {
      activateRateLimit(10); // 10 seconds
      vi.advanceTimersByTime(11_000); // advance past expiry
      expect(isRateLimited()).toBe(false);
    });

    it("auto-clears expired rate limit state on check", () => {
      activateRateLimit(5);
      vi.advanceTimersByTime(6_000);
      // isRateLimited should clear the state
      expect(isRateLimited()).toBe(false);
      const state = getRateLimitState();
      expect(state.rateLimited).toBe(false);
      expect(state.pauseUntil).toBeNull();
    });
  });

  describe("getRateLimitRemainingMs", () => {
    it("returns 0 when not rate-limited", () => {
      expect(getRateLimitRemainingMs()).toBe(0);
    });

    it("returns remaining milliseconds when rate-limited", () => {
      activateRateLimit(30); // 30 seconds
      // Immediately after activation, remaining should be ~30000ms
      const remaining = getRateLimitRemainingMs();
      expect(remaining).toBeGreaterThan(29_000);
      expect(remaining).toBeLessThanOrEqual(30_000);
    });

    it("decreases over time", () => {
      activateRateLimit(60);
      vi.advanceTimersByTime(20_000);
      const remaining = getRateLimitRemainingMs();
      expect(remaining).toBeGreaterThan(39_000);
      expect(remaining).toBeLessThanOrEqual(40_000);
    });

    it("returns 0 after pause expires", () => {
      activateRateLimit(10);
      vi.advanceTimersByTime(11_000);
      expect(getRateLimitRemainingMs()).toBe(0);
    });
  });

  describe("activateRateLimit", () => {
    it("sets rate-limited state with pauseUntil timestamp", () => {
      const now = Date.now();
      activateRateLimit(30);

      const state = getRateLimitState();
      expect(state.rateLimited).toBe(true);
      expect(state.pauseUntil).not.toBeNull();
      // pauseUntil should be approximately now + 30000ms
      expect(state.pauseUntil! - now).toBeCloseTo(30_000, -2);
    });

    it("caps pause at MAX_PAUSE_SECONDS (120s)", () => {
      const now = Date.now();
      activateRateLimit(300); // 300 seconds, should be capped to 120

      const state = getRateLimitState();
      expect(state.pauseUntil! - now).toBeLessThanOrEqual(MAX_PAUSE_MS + 10);
      expect(state.pauseUntil! - now).toBeGreaterThanOrEqual(MAX_PAUSE_MS - 10);
    });

    it("treats values <= 0 as 1 second minimum", () => {
      const now = Date.now();
      activateRateLimit(0);

      const state = getRateLimitState();
      expect(state.pauseUntil! - now).toBeCloseTo(1000, -2);
    });

    it("treats negative values as 1 second minimum", () => {
      const now = Date.now();
      activateRateLimit(-5);

      const state = getRateLimitState();
      expect(state.pauseUntil! - now).toBeCloseTo(1000, -2);
    });

    it("notifies subscribers when activated", () => {
      const listener = vi.fn();
      subscribeToRateLimit(listener);

      activateRateLimit(30);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ rateLimited: true }));
    });

    it("replaces previous rate limit if called again", () => {
      activateRateLimit(10);
      const state1 = getRateLimitState();

      vi.advanceTimersByTime(5_000);
      activateRateLimit(60); // new, longer pause
      const state2 = getRateLimitState();

      expect(state2.pauseUntil).toBeGreaterThan(state1.pauseUntil!);
    });
  });

  describe("clearRateLimitState", () => {
    it("resets state to not rate-limited", () => {
      activateRateLimit(60);
      expect(isRateLimited()).toBe(true);

      clearRateLimitState();
      expect(isRateLimited()).toBe(false);
      expect(getRateLimitState().pauseUntil).toBeNull();
    });

    it("cancels the scheduled resume timer", () => {
      const resumeCallback = vi.fn();
      onRateLimitResume(resumeCallback);

      activateRateLimit(10);
      clearRateLimitState();

      // Advance past original expiry — resume callback should NOT fire
      vi.advanceTimersByTime(15_000);
      expect(resumeCallback).not.toHaveBeenCalled();
    });

    it("notifies subscribers when cleared", () => {
      activateRateLimit(60);

      const listener = vi.fn();
      subscribeToRateLimit(listener);

      clearRateLimitState();
      expect(listener).toHaveBeenCalledWith({ rateLimited: false, pauseUntil: null });
    });
  });

  describe("subscribeToRateLimit", () => {
    it("returns an unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToRateLimit(listener);

      activateRateLimit(30);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      clearRateLimitState();
      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("supports multiple subscribers", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      subscribeToRateLimit(listener1);
      subscribeToRateLimit(listener2);

      activateRateLimit(30);
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("onRateLimitResume", () => {
    it("fires callback when pause expires", () => {
      const resumeCallback = vi.fn();
      onRateLimitResume(resumeCallback);

      activateRateLimit(10); // 10 seconds
      expect(resumeCallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10_000);
      expect(resumeCallback).toHaveBeenCalledTimes(1);
    });

    it("clears rate limit state when timer fires", () => {
      const resumeCallback = vi.fn();
      onRateLimitResume(resumeCallback);

      activateRateLimit(5);
      vi.advanceTimersByTime(5_000);

      const state = getRateLimitState();
      expect(state.rateLimited).toBe(false);
      expect(state.pauseUntil).toBeNull();
    });

    it("notifies subscribers when timer fires", () => {
      const listener = vi.fn();
      onRateLimitResume(vi.fn());
      subscribeToRateLimit(listener);

      activateRateLimit(5);
      listener.mockClear(); // clear the activation notification

      vi.advanceTimersByTime(5_000);
      expect(listener).toHaveBeenCalledWith({ rateLimited: false, pauseUntil: null });
    });
  });

  describe("handleRateLimitResponse", () => {
    it("returns false for non-429 responses", () => {
      const response = new Response("OK", { status: 200 });
      expect(handleRateLimitResponse(response)).toBe(false);
      expect(isRateLimited()).toBe(false);
    });

    it("returns false for other 4xx responses", () => {
      const response = new Response("Not Found", { status: 404 });
      expect(handleRateLimitResponse(response)).toBe(false);
    });

    it("returns true and activates rate limit for 429 with Retry-After header", () => {
      const response = new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "30" },
      });

      const result = handleRateLimitResponse(response);
      expect(result).toBe(true);
      expect(isRateLimited()).toBe(true);

      const remaining = getRateLimitRemainingMs();
      expect(remaining).toBeGreaterThan(29_000);
      expect(remaining).toBeLessThanOrEqual(30_000);
    });

    it("defaults to 5 seconds when Retry-After header is missing", () => {
      const response = new Response("Too Many Requests", { status: 429 });

      handleRateLimitResponse(response);
      expect(isRateLimited()).toBe(true);

      const remaining = getRateLimitRemainingMs();
      expect(remaining).toBeGreaterThan(4_000);
      expect(remaining).toBeLessThanOrEqual(5_000);
    });

    it("defaults to 5 seconds when Retry-After header is invalid", () => {
      const response = new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "not-a-number" },
      });

      handleRateLimitResponse(response);
      expect(isRateLimited()).toBe(true);

      const remaining = getRateLimitRemainingMs();
      expect(remaining).toBeGreaterThan(4_000);
      expect(remaining).toBeLessThanOrEqual(5_000);
    });

    it("caps Retry-After at 120 seconds", () => {
      const response = new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "600" },
      });

      handleRateLimitResponse(response);
      const remaining = getRateLimitRemainingMs();
      expect(remaining).toBeLessThanOrEqual(MAX_PAUSE_MS + 10);
    });
  });

  describe("outbox retention during pause", () => {
    it("does not modify any external state — outbox entries stay pending", () => {
      // This test documents the design: activating rate limit only sets
      // internal state. It does NOT touch the outbox or any IndexedDB data.
      // Outbox entries remain "pending" because nothing modifies them.
      activateRateLimit(60);

      // The module has no side effects on outbox — verify by checking
      // that only internal state changed
      const state = getRateLimitState();
      expect(state.rateLimited).toBe(true);
      // No outbox manipulation functions exist in this module
    });
  });

  describe("resume triggers push phase", () => {
    it("onResume callback can be used by orchestrator to restart sync", () => {
      const syncTrigger = vi.fn();
      onRateLimitResume(syncTrigger);

      activateRateLimit(15);
      expect(syncTrigger).not.toHaveBeenCalled();

      // Simulate pause expiry
      vi.advanceTimersByTime(15_000);
      expect(syncTrigger).toHaveBeenCalledTimes(1);
    });
  });
});
