/**
 * Tests for api/src/middleware/cors.ts
 * Covers: origin validation for all allowed patterns
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "../middleware/cors";

const app = new Hono();
app.use("*", corsMiddleware);
app.get("/test", (c) => c.text("ok"));

async function getOriginHeader(origin: string): Promise<string | null> {
  const res = await app.request("/test", {
    method: "GET",
    headers: { Origin: origin },
  });
  return res.headers.get("Access-Control-Allow-Origin");
}

describe("CORS middleware - origin validation", () => {
  it("allows http://localhost:3000", async () => {
    expect(await getOriginHeader("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("allows https://localhost:3000", async () => {
    expect(await getOriginHeader("https://localhost:3000")).toBe("https://localhost:3000");
  });

  it("allows http://localhost:5173", async () => {
    expect(await getOriginHeader("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("allows https://localhost:5173", async () => {
    expect(await getOriginHeader("https://localhost:5173")).toBe("https://localhost:5173");
  });

  it("allows project-specific *.pages.dev origins", async () => {
    expect(await getOriginHeader("https://koperasi-kegelapan.pages.dev")).toBe(
      "https://koperasi-kegelapan.pages.dev",
    );
    // Preview deployments
    expect(await getOriginHeader("https://abc123.koperasi-kegelapan.pages.dev")).toBe(
      "https://abc123.koperasi-kegelapan.pages.dev",
    );
  });

  it("rejects arbitrary *.pages.dev and *.workers.dev origins", async () => {
    expect(await getOriginHeader("https://evil-app.pages.dev")).toBeNull();
    expect(await getOriginHeader("https://my-api.workers.dev")).toBeNull();
  });

  it("allows https://ahmadmuzaki.my.id", async () => {
    expect(await getOriginHeader("https://ahmadmuzaki.my.id")).toBe("https://ahmadmuzaki.my.id");
  });

  it("allows https://ahmadmuzaki.biz.id", async () => {
    expect(await getOriginHeader("https://ahmadmuzaki.biz.id")).toBe("https://ahmadmuzaki.biz.id");
  });

  it("allows subdomains of ahmadmuzaki.my.id", async () => {
    expect(await getOriginHeader("https://app.ahmadmuzaki.my.id")).toBe(
      "https://app.ahmadmuzaki.my.id",
    );
  });

  it("allows subdomains of ahmadmuzaki.biz.id", async () => {
    expect(await getOriginHeader("https://api.ahmadmuzaki.biz.id")).toBe(
      "https://api.ahmadmuzaki.biz.id",
    );
  });

  it("rejects unknown origins", async () => {
    const res = await app.request("/test", {
      method: "GET",
      headers: { Origin: "https://evil.com" },
    });
    const origin = res.headers.get("Access-Control-Allow-Origin");
    expect(origin).toBeNull();
  });

  it("rejects localhost on wrong port", async () => {
    const res = await app.request("/test", {
      method: "GET",
      headers: { Origin: "http://localhost:8080" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("CORS middleware - preflight", () => {
  it("responds to OPTIONS with correct headers", async () => {
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type,Authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("includes credentials header", async () => {
    const res = await app.request("/test", {
      method: "GET",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("exposes X-Request-Id header", async () => {
    const res = await app.request("/test", {
      method: "GET",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-Request-Id");
  });
});
