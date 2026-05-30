// @vitest-environment jsdom
/**
 * Tests for KioskLayout.tsx
 * Covers: rendering, header content, mode picker dialog, mode switching,
 *         long-press interaction, logout, role-based mode options
 */
import { createElement } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("#/lib/brand", () => ({
  BRAND: { APP_NAME: "TestApp", BYLINE: "Test Byline" },
}));

const mockTenantContextStoreGet = vi.fn();
const mockTenantContextStorePut = vi.fn();
const mockTenantContextStoreDelete = vi.fn();

vi.mock("#/lib/indexeddb", () => ({
  tenantContextStore: {
    get: (...args: unknown[]) => mockTenantContextStoreGet(...args),
    put: (...args: unknown[]) => mockTenantContextStorePut(...args),
    delete: (...args: unknown[]) => mockTenantContextStoreDelete(...args),
  },
}));

vi.mock("../../ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? createElement("div", { "data-testid": "dialog" }, children) : null,
  DialogContent: ({ children }: any) =>
    createElement("div", { "data-testid": "dialog-content" }, children),
  DialogHeader: ({ children }: any) => createElement("div", null, children),
  DialogTitle: ({ children }: any) =>
    createElement("h2", { "data-testid": "dialog-title" }, children),
  DialogDescription: ({ children }: any) => createElement("p", null, children),
}));

vi.mock("../../ui/button", () => ({
  Button: ({ children, onClick, disabled, variant, className }: any) =>
    createElement("button", { onClick, disabled, "data-variant": variant, className }, children),
}));

import { KioskLayout } from "../KioskLayout";

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  children: createElement("div", { "data-testid": "content" }, "Page Content"),
  title: "Terminal",
  tenantName: "Koperasi Test",
  tenantId: "t-1",
  currentMode: "terminal" as const,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("KioskLayout — rendering", () => {
  it("renders children", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("renders tenant name in header", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.getByText("Koperasi Test")).toBeDefined();
  });

  it("renders title in header", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.getByText("Terminal")).toBeDefined();
  });

  it("renders subtitle when provided", () => {
    render(createElement(KioskLayout, { ...defaultProps, subtitle: "Check-in" }));
    expect(screen.getByText("Check-in")).toBeDefined();
  });

  it("does not render subtitle when not provided", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.queryByText("Check-in")).toBeNull();
  });

  it("renders app name from BRAND", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.getByText("TestApp")).toBeDefined();
  });

  it("renders byline from BRAND", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.getByText("Test Byline")).toBeDefined();
  });

  it("renders trailing content when provided", () => {
    const trailing = createElement("span", { "data-testid": "trailing" }, "Trailing");
    render(createElement(KioskLayout, { ...defaultProps, trailing }));
    expect(screen.getByTestId("trailing")).toBeDefined();
  });
});

describe("KioskLayout — mode picker (long press)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("does not show mode picker initially", () => {
    render(createElement(KioskLayout, defaultProps));
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("shows mode picker after long press (500ms)", () => {
    render(createElement(KioskLayout, defaultProps));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId("dialog")).toBeDefined();
  });

  it("does not show mode picker if pointer released before 500ms", () => {
    render(createElement(KioskLayout, defaultProps));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("cancels hold on pointerLeave", () => {
    render(createElement(KioskLayout, defaultProps));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerLeave(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("cancels hold on pointerCancel", () => {
    render(createElement(KioskLayout, defaultProps));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerCancel(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId("dialog")).toBeNull();
  });
});

describe("KioskLayout — mode options (admin/station role)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("shows all 4 mode options when canAccessStation=true", () => {
    render(createElement(KioskLayout, { ...defaultProps, canAccessStation: true }));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Gate")).toBeDefined();
    // "Terminal" appears in both header title and mode picker
    expect(screen.getAllByText("Terminal").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Scout")).toBeDefined();
    expect(screen.getByText("Station")).toBeDefined();
  });

  it("shows only scout option when deviceRole=scout", () => {
    render(
      createElement(KioskLayout, { ...defaultProps, canAccessStation: false, deviceRole: "scout" }),
    );
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Scout")).toBeDefined();
    expect(screen.queryByText("Gate")).toBeNull();
    expect(screen.queryByText("Station")).toBeNull();
  });

  it("shows 3 options (no Station) for non-admin roles", () => {
    render(
      createElement(KioskLayout, {
        ...defaultProps,
        canAccessStation: false,
        deviceRole: "terminal",
      }),
    );
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Gate")).toBeDefined();
    // "Terminal" appears in both header title and mode picker
    expect(screen.getAllByText("Terminal").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Scout")).toBeDefined();
    expect(screen.queryByText("Station")).toBeNull();
  });

  it("disables the currently active mode button", () => {
    render(
      createElement(KioskLayout, {
        ...defaultProps,
        canAccessStation: true,
        currentMode: "terminal",
      }),
    );
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // The Terminal button should be disabled
    const buttons = screen.getAllByRole("button");
    const terminalBtn = buttons.find((b) => b.textContent?.includes("Terminal"));
    expect((terminalBtn as HTMLButtonElement)?.disabled).toBe(true);
  });
});

describe("KioskLayout — mode switching", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockTenantContextStoreGet.mockResolvedValue({
      tenantId: "t-1",
      role: "terminal",
      canAccessStation: true,
      updatedAt: Date.now(),
    });
    mockTenantContextStorePut.mockResolvedValue(undefined);
  });

  it("navigates to selected mode", async () => {
    render(
      createElement(KioskLayout, {
        ...defaultProps,
        canAccessStation: true,
        currentMode: "terminal",
      }),
    );
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const gateBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("Gate"));
    await act(async () => {
      fireEvent.click(gateBtn!);
    });

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/tenant/t-1/gate" });
  });

  it("updates tenant context store on mode switch", async () => {
    render(
      createElement(KioskLayout, {
        ...defaultProps,
        canAccessStation: true,
        currentMode: "terminal",
      }),
    );
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const gateBtn = screen.getAllByRole("button").find((b) => b.textContent?.includes("Gate"));
    await act(async () => {
      fireEvent.click(gateBtn!);
    });

    expect(mockTenantContextStorePut).toHaveBeenCalled();
  });
});

describe("KioskLayout — logout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockTenantContextStoreDelete.mockResolvedValue(undefined);
  });

  it("renders logout button in mode picker", () => {
    render(createElement(KioskLayout, { ...defaultProps, canAccessStation: true }));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Keluar dari perangkat")).toBeDefined();
  });

  it("navigates to / and deletes context on logout", async () => {
    render(createElement(KioskLayout, { ...defaultProps, canAccessStation: true }));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const logoutBtn = screen.getByText("Keluar dari perangkat").closest("button")!;
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    expect(mockTenantContextStoreDelete).toHaveBeenCalledWith("t-1");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});

describe("KioskLayout — dialog content", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders dialog title 'Ganti Mode'", () => {
    render(createElement(KioskLayout, { ...defaultProps, canAccessStation: true }));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Ganti Mode")).toBeDefined();
  });

  it("renders dialog description", () => {
    render(createElement(KioskLayout, { ...defaultProps, canAccessStation: true }));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Pilih peran untuk perangkat ini")).toBeDefined();
  });

  it("renders mode descriptions", () => {
    render(createElement(KioskLayout, { ...defaultProps, canAccessStation: true }));
    const header = screen.getByText("Koperasi Test").closest("header")!;
    fireEvent.pointerDown(header);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Gerbang masuk & check-in")).toBeDefined();
    expect(screen.getByText("Checkout parkir & hitung durasi")).toBeDefined();
    expect(screen.getByText("Cek saldo & riwayat kartu")).toBeDefined();
    expect(screen.getByText("Kelola kartu & anggota")).toBeDefined();
  });
});
