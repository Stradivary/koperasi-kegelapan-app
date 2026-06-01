// @vitest-environment jsdom
/**
 * Tests for src/components/section/IssuanceTestSection.tsx
 * Covers: makeFreshCard helper, component rendering, form interactions,
 *         handleRead (success, v1, v2 decrypt, error), handleIssue (success, error),
 *         handleDrawerClose (scanning/writing abort), handleRetry, fetchDevGrant.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── mocks ───────────────────────────────────────────────────────────────────

const mockReadCard = vi.fn();
const mockDecodePayload = vi.fn();
const mockPrepareWrite = vi.fn();
const mockDecryptCardBody = vi.fn();

vi.mock("#/hooks/domain", () => ({
  readCard: (...args: unknown[]) => mockReadCard(...args),
  isNfcSupported: vi.fn().mockReturnValue(false),
  decodePayload: (...args: unknown[]) => mockDecodePayload(...args),
  prepareWrite: (...args: unknown[]) => mockPrepareWrite(...args),
  decryptCardBody: (...args: unknown[]) => mockDecryptCardBody(...args),
}));

vi.mock("#/hooks/types", () => ({
  MAGIC: 0x4b52,
  CARD_SCHEMA_VERSION: 2,
  BUFFER_SIZE: 128,
  WIRE_SIZE: 160,
  TRAILER_COUNTER_BIND: 12,
  CardState: { IDLE: 0 },
  CardStatus: { ACTIVE: 0 },
}));

const mockApiFetch = vi.fn();
vi.mock("#/lib/api", () => ({
  API_BASE_URL: "http://localhost:8787",
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
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

// Drawer mock — exposes onClose and onRetry so tests can invoke them
vi.mock("#/components/block/dialogs/IssuanceScanDrawer", () => ({
  IssuanceScanDrawer: ({
    open,
    phase,
    onClose,
    onRetry,
  }: {
    open: boolean;
    phase: string;
    onClose: () => void;
    onRetry: () => void;
  }) => (
    <div data-testid="issuance-scan-drawer" data-open={String(open)} data-phase={phase}>
      <button data-testid="drawer-close" onClick={onClose}>
        Close
      </button>
      <button data-testid="drawer-retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}));

// ─── imports (after mocks) ────────────────────────────────────────────────────

import { makeFreshCard, IssuanceTestSection } from "#/components/section/IssuanceTestSection";
import { MAGIC, CARD_SCHEMA_VERSION, CardState, CardStatus } from "#/hooks/types";
import { isNfcSupported } from "#/hooks/domain";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal raw Uint8Array with version byte at index 4 */
function makeRawCard(version = 1): Uint8Array {
  const buf = new Uint8Array(160);
  buf[4] = version;
  return buf;
}

const mockPayload = {
  header: { magic: 0x4b52, version: 2, type: 0, cardId: new Uint8Array(6), tenantBind: 0 },
  identity: { name: "Test User", userId: "1001", gender: 0, status: 0, createdAt: 0 },
  wallet: { balance: 50000, lastBalance: 0, counter: 1n, lastTimestamp: 0, state: 0, flags: 0 },
  session: { startTime: 0, endTime: 0, terminalId: 0 },
  logEntries: [],
  trailer: {
    expiresAt: 0,
    keyVersion: 1,
    rootHash: new Uint8Array(6),
    counterBind: 1,
    hmac: new Uint8Array(8),
    activePtr: 0,
  },
};

// ─── makeFreshCard ────────────────────────────────────────────────────────────

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
    expect(Array.from(p1.header.cardId).join(",")).not.toBe(Array.from(p2.header.cardId).join(","));
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

// ─── IssuanceTestSection — rendering ─────────────────────────────────────────

describe("IssuanceTestSection - rendering", () => {
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

  it("renders form inputs for card issuance with default values", () => {
    render(<IssuanceTestSection />);
    expect(screen.getByDisplayValue("Test User")).toBeDefined();
    expect(screen.getByDisplayValue("1001")).toBeDefined();
    expect(screen.getByDisplayValue("50000")).toBeDefined();
    expect(screen.getByDisplayValue("365")).toBeDefined();
    expect(screen.getByDisplayValue("dev")).toBeDefined();
  });

  it("disables buttons when NFC is not supported", () => {
    render(<IssuanceTestSection />);
    expect((screen.getByText("Tulis ke kartu") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Scan kartu") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the IssuanceScanDrawer closed initially in idle phase", () => {
    render(<IssuanceTestSection />);
    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.getAttribute("data-phase")).toBe("idle");
  });
});

// ─── IssuanceTestSection — form onChange handlers (lines 281-331) ─────────────

describe("IssuanceTestSection - form inputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates tenantId when input changes", () => {
    render(<IssuanceTestSection />);
    const input = screen.getByDisplayValue("dev") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tenant-abc" } });
    expect(input.value).toBe("tenant-abc");
  });

  it("updates name when input changes", () => {
    render(<IssuanceTestSection />);
    const input = screen.getByDisplayValue("Test User") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Budi Santoso" } });
    expect(input.value).toBe("Budi Santoso");
  });

  it("updates userId when input changes", () => {
    render(<IssuanceTestSection />);
    const input = screen.getByDisplayValue("1001") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2002" } });
    expect(input.value).toBe("2002");
  });

  it("updates balance when input changes", () => {
    render(<IssuanceTestSection />);
    const input = screen.getByDisplayValue("50000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100000" } });
    expect(input.value).toBe("100000");
  });

  it("updates expiresOffset when input changes", () => {
    render(<IssuanceTestSection />);
    const input = screen.getByDisplayValue("365") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "180" } });
    expect(input.value).toBe("180");
  });
});

// ─── IssuanceTestSection — handleDrawerClose (lines 133-138) ─────────────────

describe("IssuanceTestSection - handleDrawerClose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes drawer and resets to idle when closed in idle phase", () => {
    render(<IssuanceTestSection />);
    fireEvent.click(screen.getByTestId("drawer-close"));
    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.getAttribute("data-phase")).toBe("idle");
  });

  it("aborts and closes when closed during scanning phase", async () => {
    // Make readCard hang so phase stays at "scanning"
    mockReadCard.mockReturnValue(new Promise(() => {}));
    vi.mocked(isNfcSupported).mockReturnValue(true);

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });

    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-phase")).toBe("scanning");

    fireEvent.click(screen.getByTestId("drawer-close"));
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.getAttribute("data-phase")).toBe("idle");
  });

  it("aborts and closes when closed during writing phase", async () => {
    // Make prepareWrite hang so phase stays at "writing"
    vi.mocked(isNfcSupported).mockReturnValue(true);
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: "AAAA",
        expiresAt: 9999999999,
        allowedOps: [],
        signature: "BBBB",
      }),
    });
    mockPrepareWrite.mockReturnValue(new Promise(() => {}));

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });

    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-phase")).toBe("writing");

    fireEvent.click(screen.getByTestId("drawer-close"));
    expect(drawer.getAttribute("data-open")).toBe("false");
    expect(drawer.getAttribute("data-phase")).toBe("idle");
  });
});

// ─── IssuanceTestSection — handleRead (lines 143-192) ────────────────────────

describe("IssuanceTestSection - handleRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNfcSupported).mockReturnValue(true);
  });

  it("opens drawer in scanning phase when read starts", async () => {
    mockReadCard.mockReturnValue(new Promise(() => {}));
    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect(drawer.getAttribute("data-phase")).toBe("scanning");
  });

  it("sets error phase when readCard returns not ok", async () => {
    mockReadCard.mockResolvedValue({ ok: false, error: "NFC scan failed" });
    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("error"),
    );
  });

  it("decodes v1 card and sets done phase", async () => {
    const raw = makeRawCard(1); // version < 2, no decrypt
    mockReadCard.mockResolvedValue({ ok: true, raw, serialNumber: "SN-001" });
    mockDecodePayload.mockReturnValue(mockPayload);

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("done"),
    );
    expect(mockDecodePayload).toHaveBeenCalledOnce();
  });

  it("decrypts v2 card and sets done phase", async () => {
    const raw = makeRawCard(2); // version >= 2, triggers decrypt path
    mockReadCard.mockResolvedValue({ ok: true, raw, serialNumber: "SN-002" });
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: "AAAA",
        expiresAt: 9999999999,
        allowedOps: [],
        signature: "BBBB",
      }),
    });
    const decrypted = new Uint8Array(128);
    mockDecryptCardBody.mockResolvedValue(decrypted);
    mockDecodePayload.mockReturnValue(mockPayload);

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("done"),
    );
    expect(mockDecryptCardBody).toHaveBeenCalledOnce();
    expect(mockDecodePayload).toHaveBeenCalledOnce();
  });

  it("falls back to plaintext decode when v2 decryption throws", async () => {
    const raw = makeRawCard(2);
    mockReadCard.mockResolvedValue({ ok: true, raw, serialNumber: "SN-003" });
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: "AAAA",
        expiresAt: 0,
        allowedOps: [],
        signature: "BBBB",
      }),
    });
    mockDecryptCardBody.mockRejectedValue(new Error("decrypt error"));
    mockDecodePayload.mockReturnValue(mockPayload);

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("done"),
    );
    // decodePayload still called with original raw (fallback)
    expect(mockDecodePayload).toHaveBeenCalledOnce();
  });

  it("sets error phase when decodePayload throws", async () => {
    const raw = makeRawCard(1);
    mockReadCard.mockResolvedValue({ ok: true, raw, serialNumber: "SN-004" });
    mockDecodePayload.mockImplementation(() => {
      throw new Error("bad payload");
    });

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("error"),
    );
  });
});

// ─── IssuanceTestSection — handleIssue (lines 198-245) ───────────────────────

describe("IssuanceTestSection - handleIssue", () => {
  const mockNdefWrite = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNfcSupported).mockReturnValue(true);
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: "AAAA",
        expiresAt: 9999999999,
        allowedOps: [],
        signature: "BBBB",
      }),
    });
    // Mock NDEFReader as a proper class so `new NDEFReader()` works
    const writeFn = mockNdefWrite;
    (global as unknown as Record<string, unknown>).NDEFReader = class {
      write(...args: unknown[]) {
        return writeFn(...args);
      }
    };
  });

  it("opens drawer in writing phase when issue starts", async () => {
    mockPrepareWrite.mockReturnValue(new Promise(() => {}));
    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });
    const drawer = screen.getByTestId("issuance-scan-drawer");
    expect(drawer.getAttribute("data-open")).toBe("true");
    expect(drawer.getAttribute("data-phase")).toBe("writing");
  });

  it("writes card and sets done phase on success", async () => {
    const rawBytes = new Uint8Array(160);
    mockPrepareWrite.mockResolvedValue({ bytes: rawBytes });
    mockNdefWrite.mockResolvedValue(undefined);

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("done"),
    );
    expect(mockPrepareWrite).toHaveBeenCalledOnce();
    expect(mockNdefWrite).toHaveBeenCalledOnce();
  });

  it("sets error phase when prepareWrite throws", async () => {
    mockPrepareWrite.mockRejectedValue(new Error("prepare failed"));

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("error"),
    );
  });

  it("sets error phase when NDEFReader.write throws a DOMException", async () => {
    const rawBytes = new Uint8Array(160);
    mockPrepareWrite.mockResolvedValue({ bytes: rawBytes });
    mockNdefWrite.mockRejectedValue(new DOMException("User cancelled", "AbortError"));

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("error"),
    );
  });

  it("sets error phase when fetch for grant fails", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 401 });

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("error"),
    );
  });
});

// ─── IssuanceTestSection — handleRetry (lines 249-250) ───────────────────────

describe("IssuanceTestSection - handleRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNfcSupported).mockReturnValue(true);
  });

  it("retries read when drawerMode is 'read'", async () => {
    // First call hangs (scanning), second call also hangs
    mockReadCard.mockReturnValue(new Promise(() => {}));

    render(<IssuanceTestSection />);
    // Trigger read to set drawerMode = "read"
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("scanning");

    // Retry should call readCard again
    await act(async () => {
      fireEvent.click(screen.getByTestId("drawer-retry"));
    });
    expect(mockReadCard).toHaveBeenCalledTimes(2);
  });

  it("retries issue when drawerMode is 'write'", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 1,
        sessionKey: "AAAA",
        expiresAt: 0,
        allowedOps: [],
        signature: "BBBB",
      }),
    });
    // First call hangs (writing), second call also hangs
    mockPrepareWrite.mockReturnValue(new Promise(() => {}));
    (global as unknown as Record<string, unknown>).NDEFReader = class {
      write() {}
    };

    render(<IssuanceTestSection />);
    // Trigger issue to set drawerMode = "write"
    await act(async () => {
      fireEvent.click(screen.getByText("Tulis ke kartu"));
    });
    expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("writing");

    // Retry should call prepareWrite again
    await act(async () => {
      fireEvent.click(screen.getByTestId("drawer-retry"));
    });
    expect(mockPrepareWrite).toHaveBeenCalledTimes(2);
  });
});

// ─── fetchDevGrant — base64 decoding (lines 85-98) ───────────────────────────

describe("IssuanceTestSection - fetchDevGrant via handleRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNfcSupported).mockReturnValue(true);
  });

  it("correctly decodes URL-safe base64 session key from grant response", async () => {
    // Use a URL-safe base64 string with - and _ chars to exercise b64ToBytes
    const urlSafeB64 = "AAEC_-AB"; // contains _ and -
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        keyVersion: 2,
        sessionKey: urlSafeB64,
        expiresAt: 9999999999,
        allowedOps: ["read"],
        signature: urlSafeB64,
      }),
    });
    const raw = makeRawCard(2);
    mockReadCard.mockResolvedValue({ ok: true, raw, serialNumber: "SN-b64" });
    mockDecryptCardBody.mockResolvedValue(new Uint8Array(128));
    mockDecodePayload.mockReturnValue(mockPayload);

    render(<IssuanceTestSection />);
    await act(async () => {
      fireEvent.click(screen.getByText("Scan kartu"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("issuance-scan-drawer").getAttribute("data-phase")).toBe("done"),
    );
    // fetchDevGrant was called — verify apiFetch was called with correct URL
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/session-grant"),
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
      "dev",
    );
  });
});
