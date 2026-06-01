// @vitest-environment jsdom
/**
 * Tests for src/lib/repositories/ApiUIDRemoteValidator.ts
 * Covers: checkUIDExists returns exists/tenantId from API response
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiFetch = vi.fn();

vi.mock("#/lib/api", () => ({
  API_BASE_URL: "http://localhost:8787",
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { ApiUIDRemoteValidator } from "#/lib/repositories/ApiUIDRemoteValidator";

describe("ApiUIDRemoteValidator", () => {
  let validator: ApiUIDRemoteValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new ApiUIDRemoteValidator();
  });

  it("returns exists:false and tenantId:undefined when UID not found", async () => {
    mockApiFetch.mockResolvedValue({
      json: () => Promise.resolve({ exists: false, tenantId: undefined }),
    });
    const result = await validator.checkUIDExists("AABBCCDD");
    expect(result.exists).toBe(false);
    expect(result.tenantId).toBeUndefined();
  });

  it("returns exists:true and tenantId when UID is found", async () => {
    mockApiFetch.mockResolvedValue({
      json: () => Promise.resolve({ exists: true, tenantId: "t-1" }),
    });
    const result = await validator.checkUIDExists("AABBCCDD");
    expect(result.exists).toBe(true);
    expect(result.tenantId).toBe("t-1");
  });

  it("calls apiFetch with the correct URL including normalizedUID", async () => {
    mockApiFetch.mockResolvedValue({
      json: () => Promise.resolve({ exists: false }),
    });
    await validator.checkUIDExists("DEADBEEF");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "http://localhost:8787/api/cards/check-uid?uid=DEADBEEF",
    );
  });
});
