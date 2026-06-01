// @vitest-environment jsdom
/**
 * Tests for src/components/block/NfcTapArea.tsx (legacy)
 * Covers: all phases, haptic triggers, NfcStatusLabel
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTriggerHaptic = vi.fn();
vi.mock("#/lib/utils/haptics", () => ({
  triggerHaptic: (...a: unknown[]) => mockTriggerHaptic(...a),
}));
vi.mock("#/assets/images/nfc/tap_nfc.jpeg", () => ({ default: "tap.jpeg" }));
vi.mock("#/assets/images/landing/success_phone.png", () => ({ default: "success.png" }));
vi.mock("#/assets/images/nfc/failed.svg", () => ({ default: "failed.svg" }));
vi.mock("#/assets/images/nfc/tamper.svg", () => ({ default: "tamper.svg" }));

import { NfcTapArea, NfcStatusLabel } from "#/components/block/NfcTapArea";

describe("NfcTapArea", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders idle phase as a button with image", () => {
    render(<NfcTapArea phase="idle" />);
    expect(screen.getByRole("button")).toBeDefined();
    expect(screen.getByAltText("Tap kartu NFC")).toBeDefined();
  });

  it("renders idle default label", () => {
    render(<NfcTapArea phase="idle" />);
    expect(screen.getByText("Tempelkan Kartu")).toBeDefined();
  });

  it("renders idle with custom label", () => {
    render(<NfcTapArea phase="idle" label="Tap Here" />);
    expect(screen.getByText("Tap Here")).toBeDefined();
  });

  it("renders idle with tamperDetected label", () => {
    render(<NfcTapArea phase="idle" tamperDetected={true} />);
    expect(screen.getByText("⚠ Kartu terdeteksi rusak")).toBeDefined();
  });

  it("calls onClick when idle button clicked", () => {
    const onClick = vi.fn();
    render(<NfcTapArea phase="idle" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables idle button when disabled=true", () => {
    render(<NfcTapArea phase="idle" disabled={true} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders success phase with success image", () => {
    render(<NfcTapArea phase="success" />);
    expect(screen.getByAltText("Berhasil")).toBeDefined();
    expect(screen.getByText("Berhasil")).toBeDefined();
  });

  it("renders error phase with failed image", () => {
    render(<NfcTapArea phase="error" />);
    expect(screen.getByAltText("Gagal")).toBeDefined();
  });

  it("renders error phase with tamper image when tamperDetected", () => {
    render(<NfcTapArea phase="error" tamperDetected={true} />);
    expect(screen.getByAltText("Kartu rusak")).toBeDefined();
  });

  it("renders scanning phase as div with aria-label", () => {
    render(<NfcTapArea phase="scanning" />);
    expect(screen.getByLabelText("Menunggu kartu")).toBeDefined();
  });

  it("renders writing phase with aria-busy", () => {
    render(<NfcTapArea phase="writing" />);
    const el = screen.getByLabelText("Memproses");
    expect(el.getAttribute("aria-busy")).toBe("true");
  });

  it("triggers haptic on phase transition to scanning", () => {
    const { rerender } = render(<NfcTapArea phase="idle" />);
    act(() => {
      rerender(<NfcTapArea phase="scanning" />);
    });
    expect(mockTriggerHaptic).toHaveBeenCalledWith("intermediate");
  });

  it("triggers haptic on phase transition to success", () => {
    const { rerender } = render(<NfcTapArea phase="idle" />);
    act(() => {
      rerender(<NfcTapArea phase="success" />);
    });
    expect(mockTriggerHaptic).toHaveBeenCalledWith("success");
  });

  it("triggers haptic on phase transition to error", () => {
    const { rerender } = render(<NfcTapArea phase="idle" />);
    act(() => {
      rerender(<NfcTapArea phase="error" />);
    });
    expect(mockTriggerHaptic).toHaveBeenCalledWith("error");
  });

  it("does not trigger haptic when phase stays the same", () => {
    const { rerender } = render(<NfcTapArea phase="idle" />);
    act(() => {
      rerender(<NfcTapArea phase="idle" />);
    });
    expect(mockTriggerHaptic).not.toHaveBeenCalled();
  });
});

describe("NfcStatusLabel", () => {
  it("returns null for idle phase", () => {
    const { container } = render(<NfcStatusLabel phase="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for ready phase", () => {
    const { container } = render(<NfcStatusLabel phase="ready" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows error message for error phase", () => {
    render(<NfcStatusLabel phase="error" error="Write failed" />);
    expect(screen.getByText("Write failed")).toBeDefined();
  });

  it("shows tamper message for error phase with tamperDetected", () => {
    render(<NfcStatusLabel phase="error" tamperDetected={true} />);
    expect(screen.getByText("⚠ Kartu terdeteksi rusak")).toBeDefined();
  });

  it("shows default error message when no error provided", () => {
    render(<NfcStatusLabel phase="error" />);
    expect(screen.getByText("Gagal membaca kartu")).toBeDefined();
  });

  it("shows scanning message for scanning phase", () => {
    render(<NfcStatusLabel phase="scanning" />);
    expect(screen.getByText("Menunggu kartu NFC...")).toBeDefined();
  });

  it("shows writing message for writing phase", () => {
    render(<NfcStatusLabel phase="writing" />);
    expect(screen.getByText("Menulis kartu, jangan pindahkan...")).toBeDefined();
  });
});
