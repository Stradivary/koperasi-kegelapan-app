/**
 * Unit tests for RawDataInspector helper functions
 *
 * Tests the formatHexDump utility that formats raw bytes into
 * readable hex dump rows of 16 bytes each.
 *
 * **Validates: Requirements 25.2, 25.3**
 *
 * @module components/block/UnifiedNfcScanner/RawDataInspector.test
 */

import { describe, it, expect } from "vitest";
import { formatHexDump } from "./RawDataInspector";

describe("formatHexDump", () => {
  it("should return empty array for empty bytes", () => {
    const result = formatHexDump(new Uint8Array(0));
    expect(result).toEqual([]);
  });

  it("should format a single byte", () => {
    const result = formatHexDump(new Uint8Array([0x4b]));
    expect(result).toEqual(["4B"]);
  });

  it("should format bytes less than 16 in a single row", () => {
    const bytes = new Uint8Array([0x4b, 0x4f, 0x50, 0x57, 0x02, 0x00]);
    const result = formatHexDump(bytes);
    expect(result).toEqual(["4B 4F 50 57 02 00"]);
  });

  it("should format exactly 16 bytes in a single row", () => {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = i;
    const result = formatHexDump(bytes);
    expect(result).toEqual(["00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F"]);
  });

  it("should split into multiple rows of 16 bytes", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    const result = formatHexDump(bytes);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F");
    expect(result[1]).toBe("10 11 12 13 14 15 16 17 18 19 1A 1B 1C 1D 1E 1F");
  });

  it("should handle partial last row", () => {
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) bytes[i] = i + 0xa0;
    const result = formatHexDump(bytes);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("A0 A1 A2 A3 A4 A5 A6 A7 A8 A9 AA AB AC AD AE AF");
    expect(result[1]).toBe("B0 B1 B2 B3");
  });

  it("should pad single-digit hex values with leading zero", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x0f, 0xff]);
    const result = formatHexDump(bytes);
    expect(result).toEqual(["00 01 0F FF"]);
  });

  it("should use uppercase hex characters", () => {
    const bytes = new Uint8Array([0xab, 0xcd, 0xef]);
    const result = formatHexDump(bytes);
    expect(result).toEqual(["AB CD EF"]);
  });
});
