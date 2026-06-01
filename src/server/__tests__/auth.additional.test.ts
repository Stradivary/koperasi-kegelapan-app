/**
 * Additional tests for auth.ts covering uncovered lines 21 and 42:
 * - Line 21: timingSafeEqual catch block (mismatched buffer lengths in pbkdf2 format)
 * - Line 42: timingSafeEqual catch block (mismatched buffer lengths in client format)
 */
import { describe, it, expect } from "vitest";
import { verifyPassword } from "../auth";

describe("verifyPassword - timingSafeEqual catch branches", () => {
  it("returns false when pbkdf2 hash hex has odd length (invalid hex → Buffer mismatch)", () => {
    // An odd-length hex string causes Buffer.from(hex, 'hex') to produce wrong length
    // triggering the timingSafeEqual catch block (line 21)
    const oddHexHash = "abc"; // 3 chars - odd length, Buffer.from produces 1 byte
    const stored = `pbkdf2$abcdef0123456789abcdef0123456789$${oddHexHash}`;
    expect(verifyPassword("anypassword", stored)).toBe(false);
  });

  it("returns false when client-side hash hex has odd length (invalid hex → Buffer mismatch)", () => {
    // Same for client-side format - odd-length hashHex triggers catch block (line 42)
    const oddHexHash = "abc"; // 3 chars
    const stored = `100000:abcdef0123456789:${oddHexHash}`;
    expect(verifyPassword("anypassword", stored)).toBe(false);
  });
});
