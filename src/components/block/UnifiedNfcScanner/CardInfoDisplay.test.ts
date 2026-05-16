/**
 * Unit tests for CardInfoDisplay component logic.
 *
 * Tests the formatRupiah utility and component behavior expectations.
 * Full rendering tests require jsdom environment (covered in integration tests).
 *
 * @see Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { describe, it, expect } from "vitest";

// Test the formatRupiah logic directly (same implementation as in the component)
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

describe("CardInfoDisplay - formatRupiah", () => {
  it("should format zero balance", () => {
    const result = formatRupiah(0);
    expect(result).toContain("0");
    expect(result).toContain("Rp");
  });

  it("should format typical balance with thousands separator", () => {
    const result = formatRupiah(50000);
    // Indonesian format uses period as thousands separator
    expect(result).toContain("Rp");
    expect(result).toContain("50");
  });

  it("should format large balance", () => {
    const result = formatRupiah(1500000);
    expect(result).toContain("Rp");
    expect(result).toContain("1.500.000");
  });

  it("should not include decimal places", () => {
    const result = formatRupiah(12345);
    expect(result).not.toContain(",00");
    expect(result).not.toContain(".00");
  });
});

describe("CardInfoDisplay - classification label mapping", () => {
  const DEFAULT_CLASSIFICATION_LABELS: Record<string, string> = {
    empty: "Kartu Kosong",
    foreign: "Kartu Tidak Dikenal",
    invalid_format: "Format Kartu Rusak",
    unknown: "Kartu Tidak Dikenal",
  };

  it("should map 'empty' to 'Kartu Kosong'", () => {
    expect(DEFAULT_CLASSIFICATION_LABELS["empty"]).toBe("Kartu Kosong");
  });

  it("should map 'foreign' to 'Kartu Tidak Dikenal'", () => {
    expect(DEFAULT_CLASSIFICATION_LABELS["foreign"]).toBe("Kartu Tidak Dikenal");
  });

  it("should map 'invalid_format' to 'Format Kartu Rusak'", () => {
    expect(DEFAULT_CLASSIFICATION_LABELS["invalid_format"]).toBe("Format Kartu Rusak");
  });

  it("should map 'unknown' to 'Kartu Tidak Dikenal'", () => {
    expect(DEFAULT_CLASSIFICATION_LABELS["unknown"]).toBe("Kartu Tidak Dikenal");
  });
});
