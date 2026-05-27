// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { FeedbackCard } from "../FeedbackCard";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FeedbackCard", () => {
  it("renders the title", () => {
    render(<FeedbackCard variant="success" title="Berhasil!" />);
    expect(screen.getByText(/Berhasil!/)).toBeDefined();
  });

  it("renders subtitle when provided", () => {
    render(<FeedbackCard variant="success" title="OK" subtitle="Operasi selesai" />);
    expect(screen.getByText("Operasi selesai")).toBeDefined();
  });

  it("does not render subtitle when not provided", () => {
    render(<FeedbackCard variant="success" title="OK" />);
    expect(screen.queryByText("Operasi selesai")).toBeNull();
  });

  it("renders details label/value pairs", () => {
    render(
      <FeedbackCard
        variant="info"
        title="Info"
        details={[
          { label: "Saldo", value: "Rp 50.000" },
          { label: "Nama", value: "Alice" },
        ]}
      />,
    );
    expect(screen.getByText("Saldo")).toBeDefined();
    expect(screen.getByText("Rp 50.000")).toBeDefined();
    expect(screen.getByText("Nama")).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("renders action buttons", async () => {
    const onClick = vi.fn();
    render(
      <FeedbackCard
        variant="error"
        title="Gagal"
        actions={[{ label: "Coba Lagi", onClick, variant: "primary" }]}
      />,
    );
    await userEvent.click(screen.getByText("Coba Lagi"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onClose after autoClose delay", () => {
    const onClose = vi.fn();
    render(<FeedbackCard variant="success" title="OK" autoClose={2000} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose before autoClose delay", () => {
    const onClose = vi.fn();
    render(<FeedbackCard variant="success" title="OK" autoClose={2000} onClose={onClose} />);
    vi.advanceTimersByTime(1999);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not set timer when autoClose is not provided", () => {
    const onClose = vi.fn();
    render(<FeedbackCard variant="success" title="OK" onClose={onClose} />);
    vi.advanceTimersByTime(10000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders success variant with success icon", () => {
    render(<FeedbackCard variant="success" title="Done" />);
    expect(screen.getByText(/✓/)).toBeDefined();
  });

  it("renders error variant with error icon", () => {
    render(<FeedbackCard variant="error" title="Error" />);
    expect(screen.getByText(/✗/)).toBeDefined();
  });

  it("renders warning variant with warning icon", () => {
    render(<FeedbackCard variant="warning" title="Warning" />);
    expect(screen.getByText(/⚠/)).toBeDefined();
  });

  it("renders blocked variant with blocked icon", () => {
    render(<FeedbackCard variant="blocked" title="Blocked" />);
    expect(screen.getByText(/⛔/)).toBeDefined();
  });

  it("has aria-live polite for accessibility", () => {
    const { container } = render(<FeedbackCard variant="info" title="Info" />);
    const el = container.querySelector('[aria-live="polite"]');
    expect(el).toBeTruthy();
  });
});
