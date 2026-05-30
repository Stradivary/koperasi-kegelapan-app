// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
  }) => (
    <button
      type={(type ?? "button") as "button" | "submit" | "reset"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));

vi.mock("../../../ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("../../../ui/password-input", () => ({
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
}));

import { ChangePasswordDialog } from "../ChangePasswordDialog";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  accountUsername: "testuser",
  onSubmit: vi.fn(),
  isSubmitting: false,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ChangePasswordDialog", () => {
  it("renders when open is true", () => {
    render(<ChangePasswordDialog {...defaultProps} />);
    expect(screen.getByTestId("dialog")).toBeDefined();
  });

  it("does not render when open is false", () => {
    render(<ChangePasswordDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("shows the account username in description", () => {
    render(<ChangePasswordDialog {...defaultProps} />);
    expect(screen.getByText("testuser")).toBeDefined();
  });

  it("shows server error when error prop is provided", () => {
    render(<ChangePasswordDialog {...defaultProps} error="Password too weak" />);
    expect(screen.getByText("Password too weak")).toBeDefined();
  });

  it("shows validation error when password is too short after blur", async () => {
    render(<ChangePasswordDialog {...defaultProps} />);
    const newPasswordInput = screen.getByPlaceholderText("Enter new password");
    await userEvent.type(newPasswordInput, "short");
    await userEvent.tab(); // blur
    expect(screen.getByText(/at least 8 characters/i)).toBeDefined();
  });

  it("shows confirm password mismatch error", async () => {
    render(<ChangePasswordDialog {...defaultProps} />);
    const newPasswordInput = screen.getByPlaceholderText("Enter new password");
    const confirmInput = screen.getByPlaceholderText("Confirm new password");
    await userEvent.type(newPasswordInput, "password123");
    await userEvent.type(confirmInput, "different123");
    await userEvent.tab();
    expect(screen.getByText(/do not match/i)).toBeDefined();
  });

  it("calls onSubmit with new password when form is valid", async () => {
    const onSubmit = vi.fn();
    render(<ChangePasswordDialog {...defaultProps} onSubmit={onSubmit} />);
    const newPasswordInput = screen.getByPlaceholderText("Enter new password");
    const confirmInput = screen.getByPlaceholderText("Confirm new password");
    await userEvent.type(newPasswordInput, "newpassword123");
    await userEvent.type(confirmInput, "newpassword123");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(onSubmit).toHaveBeenCalledWith("newpassword123");
  });

  it("does not call onSubmit when passwords do not match", async () => {
    const onSubmit = vi.fn();
    render(<ChangePasswordDialog {...defaultProps} onSubmit={onSubmit} />);
    const newPasswordInput = screen.getByPlaceholderText("Enter new password");
    const confirmInput = screen.getByPlaceholderText("Confirm new password");
    await userEvent.type(newPasswordInput, "password123");
    await userEvent.type(confirmInput, "different456");
    await userEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables submit button when isSubmitting is true", () => {
    render(<ChangePasswordDialog {...defaultProps} isSubmitting={true} />);
    expect(screen.getByText("Saving...").closest("button")).toHaveProperty("disabled", true);
  });

  it("calls onOpenChange when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
