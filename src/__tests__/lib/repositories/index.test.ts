// @vitest-environment jsdom
/**
 * Tests for src/lib/repositories/index.ts
 * Covers: singleton exports are defined and have expected shape
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("#/infrastructure/persistence/dexie/repositories/DexieCardRepository", () => ({
  DexieCardRepository: class {
    filterByCardIdExcludingDeleted = vi.fn();
    getByTenantAndCardId = vi.fn();
  },
}));

vi.mock("#/infrastructure/persistence/dexie/repositories/DexieUserRepository", () => ({
  DexieUserRepository: class {
    getByTenantAndUserId = vi.fn();
  },
}));

vi.mock("#/infrastructure/persistence/dexie/repositories/ApiUIDRemoteValidator", () => ({
  ApiUIDRemoteValidator: class {
    checkUIDExists = vi.fn();
  },
}));

vi.mock("#/infrastructure/persistence/dexie/repositories/NavigatorOnlineStatusProvider", () => ({
  NavigatorOnlineStatusProvider: class {
    isOnline = vi.fn().mockReturnValue(true);
  },
}));

import {
  cardRepo,
  userRepo,
  uidRemoteValidator,
  onlineStatus,
} from "#/infrastructure/persistence/dexie/repositories";

describe("repositories/index singletons", () => {
  it("exports cardRepo with filterByCardIdExcludingDeleted method", () => {
    expect(typeof cardRepo.filterByCardIdExcludingDeleted).toBe("function");
  });

  it("exports cardRepo with getByTenantAndCardId method", () => {
    expect(typeof cardRepo.getByTenantAndCardId).toBe("function");
  });

  it("exports userRepo with getByTenantAndUserId method", () => {
    expect(typeof userRepo.getByTenantAndUserId).toBe("function");
  });

  it("exports uidRemoteValidator with checkUIDExists method", () => {
    expect(typeof uidRemoteValidator.checkUIDExists).toBe("function");
  });

  it("exports onlineStatus with isOnline method", () => {
    expect(typeof onlineStatus.isOnline).toBe("function");
  });

  it("cardRepo is a singleton (same reference on re-import)", async () => {
    const { cardRepo: cardRepo2 } = await import("#/infrastructure/persistence/dexie/repositories");
    expect(cardRepo2).toBe(cardRepo);
  });
});
