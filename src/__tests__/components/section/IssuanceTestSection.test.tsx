// @vitest-environment jsdom
/**
 * Tests for src/components/section/IssuanceTestSection.tsx
 * Tests the makeFreshCard helper and component rendering.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/core/nfc/engine", () => ({
  readCard: vi.fn(),
  isNfcSupported: vi.fn().mockReturnValue(false),
}));

vi.mock("#/core/payload/engine", () => ({
  decodePayload: vi.fn(),
}));

vi.mock("#/core/nfc/pipelineEngine", () => ({
  prepareWrite: vi.fn(),
  decryptCardBody: vi.fn(),
}));

vi.mock("#/core/payload/types", () => ({
  MAGIC: 0x4b52,
  CARD_SCHEMA_VERSION: 2,
  BUFFER_SIZE: 128,
  WIRE_SIZE: 160,
  TRAILER_COUNTER_BIND: 12,
  CardState: { IDLE: 0 },
  CardStatus: { ACTIVE: 0 },
}));

vi.mock("#/lib/api", () => ({
  API_BASE_URL: "http://localhost:8787",
}));

vi.mock("#/components/ui/button", () => ({
  Button: ({ children, disabled, onClick, ...props }: any) => (
    <button disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("#/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("#/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("#/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("#/components/block/dialogs/IssuanceScanDrawer", () => ({
  IssuanceScanDrawer: ({ open, phase }: { open: boolean; phase: string }) => (
    <div data-testid="issuance-scan-drawer" data-open={String(open)} data-phase={phase} />
  ),
}));

import { makeFreshCard, IssuanceTestSection } from "#/components/section/IssuanceTestSection";
import { MAGIC, CARD_SCHEMA_VERSION, CardState, CardStatus } from "#/core/payload/types";

describe("makeFreshCard", () => {
  it("creates a card payload with correct identity fields", () => {
    const payload = makeFreshCard({
      name: "Test User",
      userId: "42",
      balance: 100000,
      expiresAt: 1700000000,
    });

    expect(payload.identity.name).toBe("Test User");
    expect(payload.identity.userId).toBe("42");
    expect(payload.identity.status).toBe(CardStatus.ACTIVE);
    expect(payload.identity.gender).toBe(0);
  });

  it("creates a card payload with correct wallet fields", () => {
    const payload = makeFreshCard({
      name: "Test",
      userId: "1",
      balance: 50000,
      expiresAt: 1700000000,
    });

    expect(payload.wallet.balance).toBe(50000);
    expect(payload.wallet.lastBalance).toBe(0);
    expect(payload.wallet.counter).toBe(1n);
    expect(payload.wallet.state).toBe(CardState.IDLE);
    expect(payload.wallet.flags).toBe(0);
  });

  it("creates a card payload with correct header", () => {
    const payload = makeFreshCard({
      name: "Test",
      userId: "1",
      balance: 50000,
      expiresAt: 1700000000,
    });

    expect(payload.header.magic).toBe(MAGIC);
    expect(payload.header.version).toBe(CARD_SCHEMA_VERSION);
    expect(payload.header.type).toBe(0);
    expect(payload.header.cardId).toBeInstanceOf(Uint8Array);
    expect(payload.header.cardId.length).toBe(6);
  });

  it("creates a card payload with correct trailer", () => {
    const payload = makeFreshCard({
      name: "Test",
      userId: "1",
      balance: 50000,
      expiresAt: 1700000000,
    });

    expect(payload.trailer.expiresAt).toBe(1700000000);
    expect(payload.trailer.keyVersion).toBe(1);
    expect(payload.trailer.counterBind).toBe(1);
  });

  it("generates random cardId each time", () => {
    const p1 = makeFreshCard({ name: "A", userId: "1", balance: 0, expiresAt: 0 });
    const p2 = makeFreshCard({ name: "B", userId: "2", balance: 0, expiresAt: 0 });

    // Extremely unlikely to be equal with random bytes
    const id1 = Array.from(p1.header.cardId).join(",");
    const id2 = Array.from(p2.header.cardId).join(",");
    expect(id1).not.toBe(id2);
  });

  it("sets createdAt to current timestamp", () => {
    const before = Math.floor(Date.now() / 1000);
    const payload = makeFreshCard({ name: "T", userId: "1", balance: 0, expiresAt: 0 });
    const after = Math.floor(Date.now() / 1000);

    expect(payload.identity.createdAt).toBeGreaterThanOrEqual(before);
    expect(payload.identity.createdAt).toBeLessThanOrEqual(after);
    expect(payload.wallet.lastTimestamp).toBeGreaterThanOrEqual(before);
    expect(payload.wallet.lastTimestamp).toBeLessThanOrEqual(after);
  });
});

describe("IssuanceTestSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    render(<IssuanceTestSection />);
    expect(screen.getByText("Issuance Test")).toBeDefined();
  });

  it("shows NFC not supported warning when NFC is unavailable", () => {
    render(<IssuanceTestSection />);
    expect(screen.getByText(/Web NFC is not supported/)).toBeDefined();
  });

  it("renders form inputs for card issuance", () => {
    render(<IssuanceTestSection />);
    expect(screen.getByDisplayValue("Test User")).toBeDefined();
    expect(screen.getByDisplayValue("1001")).toBeDefined();
    expect(screen.getByDisplayValue("50000")).toBeDefined();
    expect(screen.getByDisplayValue("365")).toBeDefined();
  });

  it("renders the tenant ID input", () => {
    render(<IssuanceTestSection />);
    expect(screen.getByDisplayValue("dev")).toBeDefined();
  });

  it("disables buttons when NFC is not supported", () => {
    render(<IssuanceTestSection />);
    const writeButton = screen.getByText("Tulis ke kartu");
    const scanButton = screen.getByText("Scan kartu");
    expect(writeButton).toHaveProperty("disabled", true);
    expect(scanButton).toHaveProperty("disabled", true);
  });

  it("renders the IssuanceScanDrawer closed initially", () => {
    render(<IssuanceTestSection />);
    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.getAttribute("data-phase")).toBe("idle");
  });
});
