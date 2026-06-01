// @vitest-environment node
/**
 * Tests for api/src/middleware/authRateLimit.ts
 * Covers: sliding window logic, 429 responses, Retry-After header,
 *         success resets counter, non-POST passthrough, missing username passthrough
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { Hono } from "hono";
import {
  authRateLimit,
  resetAuthRateLimit,
  clearAllAuthRateLimits,
} from "../../middleware/authRateLimit";

type Env = { DB: D1Database; SESSION_MASTER_KEY: string };

function createApp(responseStatus = 200) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (c, next) => {
    // @ts-expect-error - mock env
    c.env = { DB: {}, SESSION_MASTER_KEY: "test-key" };
    await next();
  });
  app.use("/api/auth/token", authRateLimit);
  app.post("/api/auth/token", (c) => {
    return c.json({ ok: true }, responseStatus as 200 | 401);
  });
  return app;
}

function postLogin(app: ReturnType<typeof createApp>, username: string, password = "pass") {
  return app.request("/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

describe("authRateLimit middleware", () => {
  beforeEach(() => {
    clearAllAuthRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAllAuthRateLimits();
  });

  it("passes through GET requests without rate limiting", async () => {
    const app = createApp();
    // Add a GET handler for testing
    app.get("/api/auth/token", (c) => c.json({ ok: true }));
    const res = await app.request("/api/auth/token", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("passes through when username is missing from body", async () => {
    const app = createApp();
    const res = await app.request("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass" }),
    });
    expect(res.status).toBe(200);
  });

  it("passes through when body is invalid JSON", async () => {
    const app = createApp();
    const res = await app.request("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(200);
  });

  it("allows requests under the limit", async () => {
    const app = createApp(401); // 401 so attempts are recorded
    for (let i = 0; i < 4; i++) {
      const res = await postLogin(app, "user1");
      expect(res.status).toBe(401);
    }
  });

  it("returns 429 after 5 failed attempts", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "user2");
    }
    const res = await postLogin(app, "user2");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many login attempts");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("includes Retry-After header on 429", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "user3");
    }
    const res = await postLogin(app, "user3");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate limits are per-username (different users are independent)", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "userA");
    }
    // userB should still be allowed
    const res = await postLogin(app, "userB");
    expect(res.status).toBe(401);
  });

  it("is case-insensitive for username", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "CasedUser");
    }
    // Same user with different case should be blocked
    const res = await postLogin(app, "caseduser");
    expect(res.status).toBe(429);
  });

  it("resets counter on successful login (200)", async () => {
    const app401 = createApp(401);
    // Accumulate 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await postLogin(app401, "user4");
    }
    // Simulate a successful login
    const app200 = createApp(200);
    await postLogin(app200, "user4");
    // Now failed attempts should be reset - 5 more should be allowed
    const app401b = createApp(401);
    for (let i = 0; i < 5; i++) {
      const res = await postLogin(app401b, "user4");
      expect(res.status).toBe(401);
    }
    const res = await postLogin(app401b, "user4");
    expect(res.status).toBe(429);
  });

  it("allows requests again after the window expires", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "user5");
    }
    // Advance time past the 15-minute window
    vi.advanceTimersByTime(16 * 60 * 1000);
    const res = await postLogin(app, "user5");
    expect(res.status).toBe(401); // allowed again
  });

  it("resetAuthRateLimit clears a specific user", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "user6");
    }
    resetAuthRateLimit("user6");
    const res = await postLogin(app, "user6");
    expect(res.status).toBe(401); // allowed again
  });

  it("clearAllAuthRateLimits clears all users", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "user7");
    }
    clearAllAuthRateLimits();
    const res = await postLogin(app, "user7");
    expect(res.status).toBe(401); // allowed again
  });

  it("retryAfter is clamped between 1 and 900 seconds", async () => {
    const app = createApp(401);
    for (let i = 0; i < 5; i++) {
      await postLogin(app, "user8");
    }
    const res = await postLogin(app, "user8");
    const body = await res.json();
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(body.retryAfter).toBeLessThanOrEqual(900);
  });
});
