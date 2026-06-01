/**
 * Tests for src/core/validation/uidGlobalValidator.ts
 * Covers: normalizeUID, validateUIDLocal, validateUID (online/offline/network-error)
 */
import type { CardRepository } from "#/core/interfaces/CardRepository";
import type { OnlineStatusProvider } from "#/core/interfaces/OnlineStatusProvider";
import type { UIDRemoteValidator } from "#/core/interfaces/UIDRemoteValidator";
import { normalizeUID, validateUID, validateUIDLocal } from "#/core/validation/uidGlobalValidator";
import { describe, expect, it, vi } from "vitest";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCardRepo(cards: { cardId: string; tenantId: string }[] = []): CardRepository {
  return {
    filterByCardIdExcludingDeleted: vi.fn().mockResolvedValue(cards),
  } as unknown as CardRepository;
}

function makeRemoteValidator(exists: boolean, tenantId?: string): UIDRemoteValidator {
  return {
    checkUIDExists: vi.fn().mockResolvedValue({ exists, tenantId }),
  } as unknown as UIDRemoteValidator;
}

function makeOnlineStatus(online: boolean): OnlineStatusProvider {
  return { isOnline: () => online } as OnlineStatusProvider;
}

// ── normalizeUID ──────────────────────────────────────────────────────────────

describe("normalizeUID", () => {
  it("lowercases hex chars", () => expect(normalizeUID("ABCDEF")).toBe("abcdef"));
  it("strips colons", () => expect(normalizeUID("04:AB:CD:EF")).toBe("04abcdef"));
  it("strips dashes", () => expect(normalizeUID("04-AB-CD-EF")).toBe("04abcdef"));
  it("strips non-hex chars", () => expect(normalizeUID("04:AB:CD:EF:GH")).toBe("04abcdef"));
  it("handles already-normalized UID", () => expect(normalizeUID("04abcdef")).toBe("04abcdef"));
  it("handles empty string", () => expect(normalizeUID("")).toBe(""));
});

// ── validateUIDLocal ──────────────────────────────────────────────────────────

describe("validateUIDLocal - format validation", () => {
  it("rejects UID shorter than 8 hex chars", async () => {
    const repo = makeCardRepo();
    const result = await validateUIDLocal("1234567", "t-1", { cardRepo: repo });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
  });

  it("rejects UID longer than 14 hex chars", async () => {
    const repo = makeCardRepo();
    const result = await validateUIDLocal("a".repeat(15), "t-1", { cardRepo: repo });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
  });

  it("accepts UID of exactly 8 hex chars", async () => {
    const repo = makeCardRepo();
    const result = await validateUIDLocal("abcdef12", "t-1", { cardRepo: repo });
    expect(result.valid).toBe(true);
  });

  it("accepts UID of exactly 14 hex chars", async () => {
    const repo = makeCardRepo();
    const result = await validateUIDLocal("a".repeat(14), "t-1", { cardRepo: repo });
    expect(result.valid).toBe(true);
  });
});

describe("validateUIDLocal - local DB check", () => {
  it("returns valid when UID not found locally", async () => {
    const repo = makeCardRepo([]);
    const result = await validateUIDLocal("04abcdef12", "t-1", { cardRepo: repo });
    expect(result.valid).toBe(true);
  });

  it("returns UID_ALREADY_REGISTERED when found in same tenant", async () => {
    const repo = makeCardRepo([{ cardId: "04abcdef12", tenantId: "t-1" }]);
    const result = await validateUIDLocal("04:AB:CD:EF:12", "t-1", { cardRepo: repo });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_ALREADY_REGISTERED");
    expect(result.existingCardId).toBe("04abcdef12");
  });

  it("returns UID_REGISTERED_OTHER_TENANT when found in different tenant", async () => {
    const repo = makeCardRepo([{ cardId: "04abcdef12", tenantId: "t-other" }]);
    const result = await validateUIDLocal("04abcdef12", "t-1", { cardRepo: repo });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    expect(result.existingTenantId).toBe("t-other");
  });
});

// ── validateUID ───────────────────────────────────────────────────────────────

describe("validateUID - format validation", () => {
  it("rejects invalid format before hitting DB or network", async () => {
    const repo = makeCardRepo();
    const remote = makeRemoteValidator(false);
    const online = makeOnlineStatus(true);
    const result = await validateUID("short", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_UID_FORMAT");
    expect(remote.checkUIDExists).not.toHaveBeenCalled();
  });
});

describe("validateUID - local DB hit (skips cloud)", () => {
  it("returns UID_ALREADY_REGISTERED without calling remote", async () => {
    const repo = makeCardRepo([{ cardId: "04abcdef12", tenantId: "t-1" }]);
    const remote = makeRemoteValidator(false);
    const online = makeOnlineStatus(true);
    const result = await validateUID("04abcdef12", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_ALREADY_REGISTERED");
    expect(remote.checkUIDExists).not.toHaveBeenCalled();
  });
});

describe("validateUID - online, not in local DB", () => {
  it("returns valid when remote says UID does not exist", async () => {
    const repo = makeCardRepo([]);
    const remote = makeRemoteValidator(false);
    const online = makeOnlineStatus(true);
    const result = await validateUID("04abcdef12", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(true);
    expect(remote.checkUIDExists).toHaveBeenCalledWith("04abcdef12");
  });

  it("returns UID_REGISTERED_OTHER_TENANT when remote says UID exists", async () => {
    const repo = makeCardRepo([]);
    const remote = makeRemoteValidator(true, "t-other");
    const online = makeOnlineStatus(true);
    const result = await validateUID("04abcdef12", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_REGISTERED_OTHER_TENANT");
    expect(result.existingTenantId).toBe("t-other");
  });

  it("returns NETWORK_ERROR when remote throws", async () => {
    const repo = makeCardRepo([]);
    const remote = {
      checkUIDExists: vi.fn().mockRejectedValue(new Error("Network timeout")),
    } as unknown as UIDRemoteValidator;
    const online = makeOnlineStatus(true);
    const result = await validateUID("04abcdef12", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NETWORK_ERROR");
  });
});

describe("validateUID - offline", () => {
  it("skips remote check when offline and UID not in local DB", async () => {
    const repo = makeCardRepo([]);
    const remote = makeRemoteValidator(false);
    const online = makeOnlineStatus(false);
    const result = await validateUID("04abcdef12", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(true);
    expect(remote.checkUIDExists).not.toHaveBeenCalled();
  });

  it("still catches local DB hit when offline", async () => {
    const repo = makeCardRepo([{ cardId: "04abcdef12", tenantId: "t-1" }]);
    const remote = makeRemoteValidator(false);
    const online = makeOnlineStatus(false);
    const result = await validateUID("04abcdef12", "t-1", {
      cardRepo: repo,
      remoteValidator: remote,
      onlineStatus: online,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UID_ALREADY_REGISTERED");
  });
});
