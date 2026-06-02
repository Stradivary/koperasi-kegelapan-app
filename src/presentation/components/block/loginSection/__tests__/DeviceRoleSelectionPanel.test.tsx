// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub AuthLayout
vi.mock("../../layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

// Stub Button
vi.mock("../../../ui/button", () => ({
  Button: ({
    children,
    onClick,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
  }) => (
    <button type={(type ?? "button") as "button" | "submit" | "reset"} onClick={onClick}>
      {children}
    </button>
  ),
}));

// Stub lucide icons
vi.mock("lucide-react", () => ({
  DoorOpen: () => <span data-testid="icon-door" />,
  MonitorSmartphone: () => <span data-testid="icon-monitor" />,
  BookOpen: () => <span data-testid="icon-book" />,
}));

import { DeviceRoleSelectionPanel } from "../DeviceRoleSelectionPanel";

afterEach(() => {
  cleanup();
});

describe("DeviceRoleSelectionPanel", () => {
  it("renders all three role options", () => {
    render(<DeviceRoleSelectionPanel onSelectRole={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Gerbang (Gate)")).toBeDefined();
    expect(screen.getByText("Terminal (Exit)")).toBeDefined();
    expect(screen.getByText("Buku Saku (Scout)")).toBeDefined();
  });

  it("renders role descriptions", () => {
    render(<DeviceRoleSelectionPanel onSelectRole={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Mencatat waktu masuk ke kartu anggota")).toBeDefined();
    expect(screen.getByText("Menghitung durasi dan memotong saldo anggota")).toBeDefined();
    expect(screen.getByText("Anggota melihat saldo dan riwayat kartu")).toBeDefined();
  });

  it("calls onSelectRole with 'gate' when gate button is clicked", async () => {
    const onSelectRole = vi.fn();
    render(<DeviceRoleSelectionPanel onSelectRole={onSelectRole} onBack={vi.fn()} />);
    await userEvent.click(screen.getByText("Gerbang (Gate)").closest("button")!);
    expect(onSelectRole).toHaveBeenCalledWith("gate");
  });

  it("calls onSelectRole with 'terminal' when terminal button is clicked", async () => {
    const onSelectRole = vi.fn();
    render(<DeviceRoleSelectionPanel onSelectRole={onSelectRole} onBack={vi.fn()} />);
    await userEvent.click(screen.getByText("Terminal (Exit)").closest("button")!);
    expect(onSelectRole).toHaveBeenCalledWith("terminal");
  });

  it("calls onSelectRole with 'scout' when scout button is clicked", async () => {
    const onSelectRole = vi.fn();
    render(<DeviceRoleSelectionPanel onSelectRole={onSelectRole} onBack={vi.fn()} />);
    await userEvent.click(screen.getByText("Buku Saku (Scout)").closest("button")!);
    expect(onSelectRole).toHaveBeenCalledWith("scout");
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(<DeviceRoleSelectionPanel onSelectRole={vi.fn()} onBack={onBack} />);
    await userEvent.click(screen.getByText("Kembali"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("uses custom backLabel when provided", () => {
    render(
      <DeviceRoleSelectionPanel onSelectRole={vi.fn()} onBack={vi.fn()} backLabel="Batalkan" />,
    );
    expect(screen.getByText("Batalkan")).toBeDefined();
  });

  it("renders heading text", () => {
    render(<DeviceRoleSelectionPanel onSelectRole={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Pilih Peran Perangkat")).toBeDefined();
  });
});
