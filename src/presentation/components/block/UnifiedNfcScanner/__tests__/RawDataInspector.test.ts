// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { RawDataInspector, formatHexDump } from "../RawDataInspector";
import type { RawNfcResult } from "#/core/nfc/types.ts";

afterEach(() => {
  cleanup();
});

describe("formatHexDump", () => {
  it("formats a single byte correctly", () => {
    const bytes = new Uint8Array([0x4b]);
    const rows = formatHexDump(bytes);
    expect(rows).toEqual(["4B"]);
  });

  it("formats 16 bytes into a single row", () => {
    const bytes = new Uint8Array(16);
    bytes.fill(0xff);
    const rows = formatHexDump(bytes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe("FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF");
  });

  it("formats 17 bytes into two rows", () => {
    const bytes = new Uint8Array(17);
    bytes.fill(0xab);
    const rows = formatHexDump(bytes);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe("AB AB AB AB AB AB AB AB AB AB AB AB AB AB AB AB");
    expect(rows[1]).toBe("AB");
  });

  it("pads single-digit hex values with leading zero", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x0a, 0x0f]);
    const rows = formatHexDump(bytes);
    expect(rows[0]).toBe("00 01 0A 0F");
  });

  it("handles empty array", () => {
    const bytes = new Uint8Array(0);
    const rows = formatHexDump(bytes);
    expect(rows).toEqual([]);
  });

  it("formats 32 bytes into exactly two rows", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i;
    const rows = formatHexDump(bytes);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe("00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F");
    expect(rows[1]).toBe("10 11 12 13 14 15 16 17 18 19 1A 1B 1C 1D 1E 1F");
  });
});

describe("RawDataInspector component", () => {
  function createRawResult(overrides?: Partial<RawNfcResult>): RawNfcResult {
    return {
      serialNumber: "04:A1:B2:C3:D4:E5:F6",
      rawBytes: new Uint8Array([0x4b, 0x4f, 0x50, 0x57, 0x02, 0x00]),
      records: [{ recordType: "unknown", data: new Uint8Array([0x4b, 0x4f]) }],
      classification: "valid_payload",
      metadata: {
        recordCount: 1,
        totalBytes: 6,
        hasNdef: true,
      },
      ...overrides,
    };
  }

  it("renders nothing when rawResult is null", () => {
    const { container } = render(createElement(RawDataInspector, { rawResult: null }));
    expect(container.innerHTML).toBe("");
  });

  it("renders the collapsible trigger with default label", () => {
    render(createElement(RawDataInspector, { rawResult: createRawResult() }));
    expect(screen.getByText("Lihat Data Mentah")).toBeDefined();
  });

  it("renders the collapsible trigger with custom label", () => {
    render(
      createElement(RawDataInspector, {
        rawResult: createRawResult(),
        labels: { viewRawData: "View Raw Data" },
      }),
    );
    expect(screen.getByText("View Raw Data")).toBeDefined();
  });

  it("shows serial number when expanded", () => {
    render(createElement(RawDataInspector, { rawResult: createRawResult() }));
    fireEvent.click(screen.getByText("Lihat Data Mentah"));
    expect(screen.getByText("04:A1:B2:C3:D4:E5:F6")).toBeDefined();
  });

  it("shows byte count when expanded", () => {
    render(createElement(RawDataInspector, { rawResult: createRawResult() }));
    fireEvent.click(screen.getByText("Lihat Data Mentah"));
    expect(screen.getByText("6 bytes")).toBeDefined();
  });

  it("shows hex dump when expanded and rawBytes present", () => {
    render(createElement(RawDataInspector, { rawResult: createRawResult() }));
    fireEvent.click(screen.getByText("Lihat Data Mentah"));
    expect(screen.getByText("4B 4F 50 57 02 00")).toBeDefined();
  });

  it("shows NDEF record types when expanded", () => {
    render(
      createElement(RawDataInspector, {
        rawResult: createRawResult({
          records: [
            { recordType: "text", data: new Uint8Array([0x01]) },
            { recordType: "url", data: new Uint8Array([0x02]) },
          ],
        }),
      }),
    );
    fireEvent.click(screen.getByText("Lihat Data Mentah"));
    expect(screen.getByText("text")).toBeDefined();
    expect(screen.getByText("url")).toBeDefined();
  });

  it("does not show NDEF section when records have empty recordType", () => {
    render(
      createElement(RawDataInspector, {
        rawResult: createRawResult({
          records: [{ recordType: "", data: new Uint8Array([0x01]) }],
        }),
      }),
    );
    fireEvent.click(screen.getByText("Lihat Data Mentah"));
    expect(screen.queryByText("NDEF Record Types")).toBeNull();
  });

  it("does not show hex dump when rawBytes is null", () => {
    render(
      createElement(RawDataInspector, {
        rawResult: createRawResult({ rawBytes: null }),
      }),
    );
    fireEvent.click(screen.getByText("Lihat Data Mentah"));
    expect(screen.queryByText("Hex Dump")).toBeNull();
  });

  it("has accessible aria-label on trigger", () => {
    render(createElement(RawDataInspector, { rawResult: createRawResult() }));
    expect(screen.getByLabelText("Lihat Data Mentah")).toBeDefined();
  });
});
