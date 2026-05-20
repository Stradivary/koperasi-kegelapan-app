/**
 * Unit tests for UIDGlobalValidator
 *
 * Tests the UID validation logic for:
 * - UID normalization (strip colons, dashes, non-hex chars, lowercase)
 * - Format validation (reject < 8 or > 14 hex chars)
 * - Local IndexedDB check (same tenant → UID_ALREADY_REGISTERED)
 * - Local IndexedDB check (different tenant → UID_REGISTERED_OTHER_TENANT)
 * - Cloud API check (exists → UID_REGISTERED_OTHER_TENANT)
 * - Network error → fail-closed (NETWORK_ERROR)
 * - Offline fallback → local-only, return valid if not found
 * - Skip cloud if found locally
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeUID, validateUID, validateUIDLocal } from "../uidGlobalValidator";

// Mock local-db
vi.mock("../../../db/local-db", () => ({
  localDb: {
    cards: {
      filter: vi.fn(),
    },
  },
}));

// Mock api
vi.mock("../../../lib/api", () => ({
  API_BASE_URL: "https://api.test.com",
  apiFetch: vi.fn(),
}));

import { localDb } from "../../../db/local-db";
import { apiFetch } from "../../../lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function mockLocalCards(cards: Array<{ tenantId: string; cardId: string }>) {
  vi.mocked(localDb.cards.filter).mockReturnValue({
    toArray: vi.fn().mockResolvedValue(cards),
  } as any);
}

describe("normalizeUID", () => {
  it("should strip colons from serial number", () => {
    expect(normalizeUID("04:A2:B3:C4:D5:E6:F7")).toBe("04a2b3c4d5e6f7");
  });

  it("should strip dashes from serial number", () => {
    expect(normalizeUID("04-A2-B3-C4-D5-E6-F7")).toBe("04a2b3c4d5e6f7");
  });

  it("should strip non-hex characters", () => {
    expect(normalizeUID("04xA2yB3zC4")).toBe("04a2b3c4");
  });

  it("should convert to lowercase", () => {
    expect(normalizeUID("04A2B3C4D5E6F7")).toBe("04a2b3c4d5e6f7");
  });

  it("should handle already normalized input", () => {
    expect(normalizeUID("04a2b3c4d5e6f7")).toBe("04a2b3c4d5e6f7");
  });

  it("should handle empty string", () => {
    expect(normalizeUID("")).toBe("");
  });
});

describe("validateUID - format validation (Requirement 7.6)", () => {
  it("should reject UID shorter than 8 hex chars", async () => {
    const result = await validateUID("04A2B3", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
  });

  it("should reject UID longer than 14 hex chars", async () => {
    const result = await validateUID("04A2B3C4D5E6F7A8", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
  });

  it("should accept UID with exactly 8 hex chars", async () => {
    mockLocalCards([]);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const result = await validateUID("04A2B3C4", "tenant-1");

    expect(result.valid).toBe(true);
  });

  it("should accept UID with exactly 14 hex chars", async () => {
    mockLocalCards([]);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const result = await validateUID("04:A2:B3:C4:D5:E6:F7", "tenant-1");

    expect(result.valid).toBe(true);
  });

  it("should validate format after normalization (stripping separators)", async () => {
    // "04:A2:B3" normalizes to "04a2b3" which is 6 chars → invalid
    const result = await validateUID("04:A2:B3", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
  });
});

describe("validateUID - local DB check (Requirements 7.1, 7.8)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("should return UID_ALREADY_REGISTERED when found in current tenant (Req 7.1)", async () => {
    mockLocalCards([{ tenantId: "tenant-1", cardId: "04a2b3c4d5e6f7" }]);

    const result = await validateUID("04:A2:B3:C4:D5:E6:F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_ALREADY_REGISTERED");
    expect(result.existingCardId).toBe("04a2b3c4d5e6f7");
  });

  it("should return UID_REGISTERED_OTHER_TENANT when found in different tenant", async () => {
    mockLocalCards([{ tenantId: "tenant-2", cardId: "04a2b3c4d5e6f7" }]);

    const result = await validateUID("04:A2:B3:C4:D5:E6:F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    expect(result.existingTenantId).toBe("tenant-2");
  });

  it("should skip cloud API if found locally (Req 7.8)", async () => {
    mockLocalCards([{ tenantId: "tenant-1", cardId: "04a2b3c4d5e6f7" }]);

    await validateUID("04:A2:B3:C4:D5:E6:F7", "tenant-1");

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("validateUID - cloud API check (Requirements 7.2, 7.3, 7.4)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    mockLocalCards([]);
  });

  it("should return UID_REGISTERED_OTHER_TENANT when cloud says exists (Req 7.2)", async () => {
    mockedApiFetch.mockResolvedValue({
      json: () => Promise.resolve({ exists: true, tenantId: "tenant-other" }),
    } as any);

    const result = await validateUID("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    expect(result.existingTenantId).toBe("tenant-other");
  });

  it("should return valid when cloud says not exists (Req 7.3)", async () => {
    mockedApiFetch.mockResolvedValue({
      json: () => Promise.resolve({ exists: false }),
    } as any);

    const result = await validateUID("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(true);
  });

  it("should return NETWORK_ERROR on fetch failure - fail-closed (Req 7.4)", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network timeout"));

    const result = await validateUID("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NETWORK_ERROR");
  });

  it("should call cloud API with normalized UID", async () => {
    mockedApiFetch.mockResolvedValue({
      json: () => Promise.resolve({ exists: false }),
    } as any);

    await validateUID("04:A2:B3:C4:D5:E6:F7", "tenant-1");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "https://api.test.com/api/cards/check-uid?uid=04a2b3c4d5e6f7",
    );
  });
});

describe("validateUID - offline fallback (Requirement 7.7)", () => {
  it("should return valid when offline and not found locally", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockLocalCards([]);

    const result = await validateUID("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(true);
  });

  it("should not call cloud API when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockLocalCards([]);

    await validateUID("04A2B3C4D5E6F7", "tenant-1");

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("should still reject locally found UID when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockLocalCards([{ tenantId: "tenant-1", cardId: "04a2b3c4d5e6f7" }]);

    const result = await validateUID("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_ALREADY_REGISTERED");
  });
});

describe("validateUIDLocal (Requirement 7.7)", () => {
  it("should return valid when UID not found locally", async () => {
    mockLocalCards([]);

    const result = await validateUIDLocal("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(true);
  });

  it("should return UID_ALREADY_REGISTERED when found in current tenant", async () => {
    mockLocalCards([{ tenantId: "tenant-1", cardId: "04a2b3c4d5e6f7" }]);

    const result = await validateUIDLocal("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_ALREADY_REGISTERED");
  });

  it("should return UID_REGISTERED_OTHER_TENANT when found in different tenant", async () => {
    mockLocalCards([{ tenantId: "tenant-2", cardId: "04a2b3c4d5e6f7" }]);

    const result = await validateUIDLocal("04A2B3C4D5E6F7", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    expect(result.existingTenantId).toBe("tenant-2");
  });

  it("should reject invalid format", async () => {
    const result = await validateUIDLocal("04A2", "tenant-1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
  });

  it("should never call cloud API", async () => {
    mockLocalCards([]);

    await validateUIDLocal("04A2B3C4D5E6F7", "tenant-1");

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
