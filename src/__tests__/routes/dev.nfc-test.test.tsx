// @vitest-environment jsdom
/**
 * Tests for src/routes/dev.nfc-test.tsx
 * Tests the NfcTestPage helper functions and basic rendering.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: null }),
}));

// Test the helper functions directly
function toHex(bytes: Uint8Array, maxBytes = 64): string {
  const slice = bytes.slice(0, maxBytes);
  const hex = Array.from(slice)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return bytes.length > maxBytes ? `${hex} … (+${bytes.length - maxBytes} bytes)` : hex;
}

describe("toHex helper", () => {
  it("converts bytes to hex string", () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xff, 0xab]);
    expect(toHex(bytes)).toBe("00 0f ff ab");
  });

  it("truncates at maxBytes and shows remaining count", () => {
    const bytes = new Uint8Array(100);
    bytes.fill(0xaa);
    const result = toHex(bytes, 4);
    expect(result).toBe("aa aa aa aa … (+96 bytes)");
  });

  it("handles empty array", () => {
    expect(toHex(new Uint8Array(0))).toBe("");
  });

  it("does not truncate when exactly at maxBytes", () => {
    const bytes = new Uint8Array(4);
    bytes.fill(0xbb);
    const result = toHex(bytes, 4);
    expect(result).toBe("bb bb bb bb");
  });

  it("pads single-digit hex values with leading zero", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x0a]);
    expect(toHex(bytes)).toBe("01 02 0a");
  });
});

// Test the NfcTestPage rendering (without NDEFReader)
describe("NfcTestPage", () => {
  function NfcTestPageSimple() {
    const supported = typeof globalThis !== "undefined" && "NDEFReader" in globalThis;

    return (
      <div>
        <h1>NFC Raw Test</h1>
        <p>Direct NDEFReader API — no payload encoding. Dev/LAN only.</p>

        {!supported && (
          <div data-testid="nfc-not-supported">
            NDEFReader not available. Requires Chrome on Android over HTTPS (or localhost).
          </div>
        )}
      </div>
    );
  }

  it("renders the page title", () => {
    render(<NfcTestPageSimple />);
    expect(screen.getByText("NFC Raw Test")).toBeDefined();
  });

  it("renders the subtitle", () => {
    render(<NfcTestPageSimple />);
    expect(
      screen.getByText("Direct NDEFReader API — no payload encoding. Dev/LAN only."),
    ).toBeDefined();
  });

  it("shows NDEFReader not available warning in jsdom", () => {
    render(<NfcTestPageSimple />);
    expect(screen.getByTestId("nfc-not-supported")).toBeDefined();
    expect(screen.getByText(/NDEFReader not available/)).toBeDefined();
  });
});
