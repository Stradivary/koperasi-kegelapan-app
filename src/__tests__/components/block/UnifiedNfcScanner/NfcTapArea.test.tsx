// @vitest-environment jsdom
/**
 * Tests for src/components/block/UnifiedNfcScanner/NfcTapArea.tsx
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/presentation/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));
vi.mock("lucide-react", () => ({
  Wifi: ({ size, className }: { size?: number; className?: string }) => (
    <svg data-testid="wifi-icon" data-size={size} className={className} />
  ),
}));
vi.mock("#/assets/images/nfc/tap_nfc.jpeg", () => ({ default: "tap_nfc.jpeg" }));

import { NfcTapArea } from "#/presentation/components/block/UnifiedNfcScanner/NfcTapArea";

describe("NfcTapArea", () => {
  it("renders idle phase with image", () => {
    render(<NfcTapArea phase="idle" />);
    const img = screen.getByAltText("Tap kartu NFC");
    expect(img).toBeDefined();
  });

  it("renders idle phase with default label", () => {
    render(<NfcTapArea phase="idle" />);
    expect(screen.getByText("Tempelkan Kartu")).toBeDefined();
  });

  it("renders scanning phase with wifi icon", () => {
    render(<NfcTapArea phase="scanning" />);
    expect(screen.getByTestId("wifi-icon")).toBeDefined();
  });

  it("renders scanning phase with default label", () => {
    render(<NfcTapArea phase="scanning" />);
    expect(screen.getByText("Menunggu kartu...")).toBeDefined();
  });

  it("renders writing phase with warning label", () => {
    render(<NfcTapArea phase="writing" />);
    expect(screen.getByText("Menulis kartu...")).toBeDefined();
  });

  it("renders classifying phase", () => {
    render(<NfcTapArea phase="classifying" />);
    expect(screen.getByText("Mengidentifikasi kartu...")).toBeDefined();
  });

  it("renders validating phase", () => {
    render(<NfcTapArea phase="validating" />);
    expect(screen.getByText("Memvalidasi kartu...")).toBeDefined();
  });

  it("renders write_pending_retry phase", () => {
    render(<NfcTapArea phase="write_pending_retry" />);
    expect(screen.getByText("Tempelkan kartu lagi...")).toBeDefined();
  });

  it("uses custom label when provided", () => {
    render(<NfcTapArea phase="idle" labels={{ idle: "Custom Label" }} />);
    expect(screen.getByText("Custom Label")).toBeDefined();
  });

  it("has role=status for accessibility", () => {
    render(<NfcTapArea phase="scanning" />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("does not show label for success phase (no label in showLabel set)", () => {
    render(<NfcTapArea phase="success" />);
    // success phase has no label shown
    expect(screen.queryByText("Berhasil")).toBeNull();
  });
});
