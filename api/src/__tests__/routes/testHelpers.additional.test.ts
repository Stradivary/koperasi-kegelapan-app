/**
 * Tests for testHelpers.ts covering uncovered lines 52-63:
 * The prepare().raw(), prepare().first(), prepare().all(), prepare().run()
 * methods (without bind) on the mock D1 database.
 */
import { describe, it, expect } from "vitest";
import { createMockD1, makeToken, createTestApp } from "./testHelpers";
import { Hono } from "hono";

describe("createMockD1 - prepare() without bind() (lines 52-63)", () => {
  it("prepare().raw() returns rawRows", async () => {
    const db = createMockD1({ rawRows: [["row1"], ["row2"]] });
    const stmt = db.prepare("SELECT 1");
    const result = await (stmt as any).raw();
    expect(result).toEqual([["row1"], ["row2"]]);
  });

  it("prepare().first() returns getResult", async () => {
    const db = createMockD1({ getResult: { id: 42 } });
    const stmt = db.prepare("SELECT 1");
    const result = await (stmt as any).first();
    expect(result).toEqual({ id: 42 });
  });

  it("prepare().first() returns null when getResult not set", async () => {
    const db = createMockD1();
    const stmt = db.prepare("SELECT 1");
    const result = await (stmt as any).first();
    expect(result).toBeNull();
  });

  it("prepare().all() returns selectResults", async () => {
    const db = createMockD1({ selectResults: [{ id: 1 }, { id: 2 }] });
    const stmt = db.prepare("SELECT 1");
    const result = await (stmt as any).all();
    expect(result).toEqual({ results: [{ id: 1 }, { id: 2 }] });
  });

  it("prepare().run() resolves successfully", async () => {
    const db = createMockD1();
    const stmt = db.prepare("INSERT INTO t VALUES (1)");
    const result = await (stmt as any).run();
    expect(result).toEqual({ success: true, meta: {} });
  });

  it("prepare().run() rejects when insertThrow is set", async () => {
    const db = createMockD1({ insertThrow: "UNIQUE constraint failed" });
    const stmt = db.prepare("INSERT INTO t VALUES (1)");
    await expect((stmt as any).run()).rejects.toThrow("UNIQUE constraint failed");
  });

  it("prepare().run() rejects when throwOnInsert is set", async () => {
    const db = createMockD1({ throwOnInsert: "duplicate key" });
    const stmt = db.prepare("INSERT INTO t VALUES (1)");
    await expect((stmt as any).run()).rejects.toThrow("duplicate key");
  });
});

describe("makeToken", () => {
  it("creates a valid Bearer token with the given payload", () => {
    const token = makeToken({ tenantId: "t1", accountId: "a1" });
    expect(token).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.sig$/);
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1]));
    expect(payload.tenantId).toBe("t1");
    expect(payload.accountId).toBe("a1");
  });
});

describe("createTestApp", () => {
  it("creates an app that injects DB env and mounts the route", async () => {
    const route = new Hono();
    route.get("/ping", (c) => c.json({ ok: true }));

    const app = createTestApp(route, "/api/test");
    const res = await app.request("/api/test/ping");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("uses provided db when passed", async () => {
    const db = createMockD1({ getResult: { found: true } });
    const route = new Hono<{ Bindings: { DB: D1Database; SESSION_MASTER_KEY: string } }>();
    route.get("/check", async (c) => {
      const result = await c.env.DB.prepare("SELECT 1").first();
      return c.json({ result });
    });

    const app = createTestApp(route, "/api/test", db);
    const res = await app.request("/api/test/check");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toEqual({ found: true });
  });
});
