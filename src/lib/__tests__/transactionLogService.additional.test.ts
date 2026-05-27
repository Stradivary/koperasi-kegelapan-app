/**
 * Additional tests for transactionLogService.ts covering lines 37-40:
 * TransactionWriteError constructor
 */
import { describe, it, expect } from "vitest";
import { TransactionWriteError } from "../transactionLogService";

describe("TransactionWriteError", () => {
  it("has correct name and message", () => {
    const err = new TransactionWriteError("write failed");
    expect(err.name).toBe("TransactionWriteError");
    expect(err.message).toBe("write failed");
    expect(err instanceof Error).toBe(true);
  });

  it("stores cause when provided", () => {
    const cause = new Error("underlying cause");
    const err = new TransactionWriteError("write failed", cause);
    expect(err.cause).toBe(cause);
  });

  it("cause is undefined when not provided", () => {
    const err = new TransactionWriteError("write failed");
    expect(err.cause).toBeUndefined();
  });

  it("accepts non-Error cause", () => {
    const err = new TransactionWriteError("write failed", "string cause");
    expect(err.cause).toBe("string cause");
  });
});
