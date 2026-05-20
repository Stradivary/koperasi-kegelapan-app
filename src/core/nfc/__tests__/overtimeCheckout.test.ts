import { describe, it, expect, vi, beforeEach } from "vitest";
import { performOvertimeCheckout, DEFAULT_OVERTIME_TARIFF_RATE } from "../overtimeCheckout";
import { CardState, CardStatus, type CardPayload } from "../../payload/types";

// Mock the localDb for transaction logging
vi.mock("../../../db/local-db", () => ({
  localDb: {
    transactionLog: {
      add: vi.fn().mockResolvedValue(1),
    },
  },
}));

function makePayload(
  overrides: {
    balance?: number;
    state?: CardState;
    startTime?: number;
    status?: CardStatus;
  } = {},
): CardPayload {
  return {
    header: {
      magic: 0x4d424300,
      version: 2,
      type: 0,
      cardId: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      tenantBind: 0,
    },
    identity: {
      userId: 1,
      name: "Test User",
      gender: 0,
      status: overrides.status ?? CardStatus.ACTIVE,
      createdAt: 1700000000,
    },
    wallet: {
      balance: overrides.balance ?? 50_000,
      lastBalance: 50_000,
      counter: 5n,
      state: overrides.state ?? CardState.CHECKED_IN,
      lastTimestamp: overrides.startTime ?? 1700000000,
      flags: 0,
    },
    session: {
      startTime: overrides.startTime ?? 1700000000,
      endTime: 0,
      terminalId: 1,
    },
    logEntries: [],
    trailer: {
      expiresAt: 9_999_999_999,
      keyVersion: 1,
      rootHash: new Uint8Array(6),
      counterBind: 5,
      hmac: new Uint8Array(8),
      activePtr: 0,
    },
  };
}

describe("performOvertimeCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Normal checkout (no overtime)", () => {
    it("should perform normal checkout when session is within 24 hours", async () => {
      const startTime = 1700000000;
      const nowSeconds = startTime + 3600; // 1 hour later
      const payload = makePayload({ startTime, balance: 50_000 });

      const result = await performOvertimeCheckout(payload, nowSeconds, "tenant-1", "device-1");

      expect(result.success).toBe(true);
      expect(result.overtime).toBe(false);
      expect(result.action).toBe("NORMAL_CHECKOUT");
      expect(result.updatedPayload).toBeDefined();
      expect(result.operationType).toBe("checkout");
      expect(result.durationSeconds).toBe(3600);
    });

    it("should deduct parking fee for normal checkout", async () => {
      const startTime = 1700000000;
      const nowSeconds = startTime + 7200; // 2 hours later
      const payload = makePayload({ startTime, balance: 50_000 });

      const result = await performOvertimeCheckout(payload, nowSeconds, "tenant-1", "device-1");

      expect(result.success).toBe(true);
      expect(result.overtime).toBe(false);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.updatedPayload!.wallet.balance).toBeLessThan(50_000);
    });
  });

  describe("Overtime checkout with sufficient balance (Req 2.1, 2.3, 4.1)", () => {
    it("should detect overtime and deduct penalty when balance is sufficient", async () => {
      const startTime = 1700000000;
      // 25 hours later (1 hour overtime)
      const nowSeconds = startTime + 25 * 3600;
      const payload = makePayload({ startTime, balance: 50_000 });

      const result = await performOvertimeCheckout(
        payload,
        nowSeconds,
        "tenant-1",
        "device-1",
        DEFAULT_OVERTIME_TARIFF_RATE,
      );

      expect(result.success).toBe(true);
      expect(result.overtime).toBe(true);
      expect(result.action).toBe("PENALTY_DEDUCTED");
      expect(result.penaltyAmount).toBe(DEFAULT_OVERTIME_TARIFF_RATE); // 1 hour * 5000
      expect(result.updatedPayload).toBeDefined();
      expect(result.updatedPayload!.wallet.balance).toBe(50_000 - DEFAULT_OVERTIME_TARIFF_RATE);
      expect(result.updatedPayload!.wallet.state).toBe(CardState.IDLE);
      expect(result.updatedPayload!.session.startTime).toBe(0);
    });

    it("should log penalty transaction to IndexedDB", async () => {
      const { localDb } = await import("../../../db/local-db");
      const startTime = 1700000000;
      const nowSeconds = startTime + 26 * 3600; // 2 hours overtime
      const payload = makePayload({ startTime, balance: 50_000 });

      await performOvertimeCheckout(
        payload,
        nowSeconds,
        "tenant-1",
        "device-1",
        DEFAULT_OVERTIME_TARIFF_RATE,
      );

      expect(localDb.transactionLog.add).toHaveBeenCalledTimes(1);
      const logEntry = (localDb.transactionLog.add as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logEntry.tenantId).toBe("tenant-1");
      expect(logEntry.type).toBe("checkout");
      expect(logEntry.amount).toBe(2 * DEFAULT_OVERTIME_TARIFF_RATE); // 2 hours * 5000
      expect(logEntry.syncStatus).toBe("pending");
    });
  });

  describe("Overtime checkout with insufficient balance (Req 2.4, 4.2)", () => {
    it("should block checkout when balance is less than penalty", async () => {
      const startTime = 1700000000;
      // 30 hours later (6 hours overtime → 30,000 IDR penalty)
      const nowSeconds = startTime + 30 * 3600;
      const payload = makePayload({ startTime, balance: 10_000 }); // Only 10k

      const result = await performOvertimeCheckout(
        payload,
        nowSeconds,
        "tenant-1",
        "device-1",
        DEFAULT_OVERTIME_TARIFF_RATE,
      );

      expect(result.success).toBe(false);
      expect(result.overtime).toBe(true);
      expect(result.action).toBe("TOPUP_REQUIRED");
      expect(result.shortfall).toBe(30_000 - 10_000); // 20,000 shortfall
      expect(result.error).toContain("Saldo tidak cukup");
      expect(result.updatedPayload).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle exactly 24 hours as normal checkout (no overtime)", async () => {
      const startTime = 1700000000;
      const nowSeconds = startTime + 86400; // Exactly 24 hours
      const payload = makePayload({ startTime, balance: 50_000 });

      const result = await performOvertimeCheckout(payload, nowSeconds, "tenant-1", "device-1");

      expect(result.success).toBe(true);
      expect(result.overtime).toBe(false);
      expect(result.action).toBe("NORMAL_CHECKOUT");
    });

    it("should handle card not in CHECKED_IN state as normal checkout", async () => {
      const startTime = 1700000000;
      const nowSeconds = startTime + 30 * 3600; // Would be overtime
      const payload = makePayload({ startTime, balance: 50_000, state: CardState.IDLE });

      const result = await performOvertimeCheckout(payload, nowSeconds, "tenant-1", "device-1");

      // OvertimeValidator returns overtime: false for non-CHECKED_IN state
      expect(result.success).toBe(true);
      expect(result.overtime).toBe(false);
      expect(result.action).toBe("NORMAL_CHECKOUT");
    });

    it("should handle null deviceId gracefully", async () => {
      const startTime = 1700000000;
      const nowSeconds = startTime + 25 * 3600;
      const payload = makePayload({ startTime, balance: 50_000 });

      const result = await performOvertimeCheckout(
        payload,
        nowSeconds,
        "tenant-1",
        null,
        DEFAULT_OVERTIME_TARIFF_RATE,
      );

      expect(result.success).toBe(true);
      expect(result.overtime).toBe(true);
      expect(result.action).toBe("PENALTY_DEDUCTED");
    });
  });
});
