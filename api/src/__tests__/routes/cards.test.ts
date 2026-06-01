import { describe, it, expect, beforeEach } from "vitest";
import { cardsRoutes } from "../../routes/cards";
import { createMockD1, createTestApp } from "./testHelpers";

describe("GET /api/cards/check-uid", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp(cardsRoutes, "/api/cards", createMockD1());
  });

  it("returns 400 when uid is missing", async () => {
    const res = await app.request("/api/cards/check-uid");
    expect(res.status).toBe(400);
  });

  it("returns 400 for short UID", async () => {
    const res = await app.request("/api/cards/check-uid?uid=abcdef");
    expect(res.status).toBe(400);
  });

  it("returns 400 for long UID", async () => {
    const r = await app.request("/api/cards/check-uid?uid=0123456789abcdef");
    expect(r.status).toBe(400);
  });

  it("returns 400 for non-hex UID", async () => {
    const r = await app.request("/api/cards/check-uid?uid=gggggggg");
    expect(r.status).toBe(400);
  });

  it("returns exists:false when not found", async () => {
    const localApp = createTestApp(cardsRoutes, "/api/cards", createMockD1({ rawRows: [] }));
    const r = await localApp.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("returns exists:true with tenantId when found", async () => {
    const localApp = createTestApp(
      cardsRoutes,
      "/api/cards",
      createMockD1({ rawRows: [["tenant-123"]] }),
    );
    const r = await localApp.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: true, tenantId: "tenant-123" });
  });

  it("returns exists:false when only deleted cards match", async () => {
    const localApp = createTestApp(cardsRoutes, "/api/cards", createMockD1({ rawRows: [] }));
    const r = await localApp.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("normalizes UID with colons and uppercase", async () => {
    const localApp = createTestApp(cardsRoutes, "/api/cards", createMockD1({ rawRows: [] }));
    const r = await localApp.request("/api/cards/check-uid?uid=04:A2:B3:C4:D5:E6:F7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("accepts 8 hex char UID", async () => {
    const localApp = createTestApp(cardsRoutes, "/api/cards", createMockD1({ rawRows: [] }));
    const r = await localApp.request("/api/cards/check-uid?uid=04a2b3c4");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });

  it("accepts 14 hex char UID", async () => {
    const localApp = createTestApp(cardsRoutes, "/api/cards", createMockD1({ rawRows: [] }));
    const r = await localApp.request("/api/cards/check-uid?uid=04a2b3c4d5e6f7");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ exists: false });
  });
});
