/**
 * Additional tests for superadminAccounts.ts covering line 202:
 * createAccount rethrows non-UNIQUE errors
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockRun = vi.fn();

vi.mock("#/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => ({ all: vi.fn().mockResolvedValue([]) })),
              })),
            })),
            get: mockGet,
          })),
        })),
        where: vi.fn(() => ({ get: mockGet })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockRun })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ run: mockRun })) })),
    })),
  })),
}));

vi.mock("./auth", () => ({
  hashPassword: vi.fn(() => "pbkdf2$salt$hash"),
  generateId: vi.fn(() => "generated-id-123"),
}));

import { createAccount } from "../superadminAccounts";

describe("createAccount - rethrows non-UNIQUE errors (line 202)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ tenantId: "t1" });
  });

  it("rethrows non-UNIQUE database errors", async () => {
    mockRun.mockRejectedValue(new Error("Connection timeout"));

    await expect(
      createAccount({
        tenantId: "t1",
        username: "validuser",
        password: "password123",
        role: "admin",
      }),
    ).rejects.toThrow("Connection timeout");
  });
});
