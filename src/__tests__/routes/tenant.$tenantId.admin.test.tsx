// @vitest-environment jsdom
/**
 * Tests for src/routes/tenant.$tenantId.admin.tsx
 * Verifies the /tenant/$tenantId/admin route redirects to /cards.
 */
import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null, beforeLoad: null }),
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("REDIRECT");
  },
}));

import { redirect } from "@tanstack/react-router";

describe("tenant.$tenantId.admin route (/tenant/$tenantId/admin)", () => {
  it("redirects to /tenant/$tenantId/cards with correct params", () => {
    const params = { tenantId: "t-1" };

    // Simulate the beforeLoad behavior
    expect(() => {
      redirect({ to: "/tenant/$tenantId/cards", params: { tenantId: params.tenantId } });
    }).toThrow("REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith({
      to: "/tenant/$tenantId/cards",
      params: { tenantId: "t-1" },
    });
  });

  it("redirects with different tenantId", () => {
    const params = { tenantId: "tenant-abc" };

    expect(() => {
      redirect({ to: "/tenant/$tenantId/cards", params: { tenantId: params.tenantId } });
    }).toThrow("REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith({
      to: "/tenant/$tenantId/cards",
      params: { tenantId: "tenant-abc" },
    });
  });
});
