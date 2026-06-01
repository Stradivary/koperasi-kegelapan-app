// @vitest-environment jsdom
/**
 * Tests for src/components/block/loginSection/DeviceSetupAuthPanel.tsx
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/components/layout/AuthLayout", () => ({
  AuthLayout: ({ children }: { children: React.ReactNode; variant?: string }) => (
    <div data-testid="auth-layout">{children}</div>
  ),
}));

vi.mock("#/components/block/LoadingState", () => ({
  LoadingState: ({ variant }: { variant?: string }) => (
    <span data-testid="loading-state" data-variant={variant}>
      Loading
    </span>
  ),
}));

vi.mock("#/components/ui/button", () => ({
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
    variant?: string;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type as "button" | "submit" | "reset" | undefined}
    >
      {children}
    </button>
  ),
}));

vi.mock("#/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("#/components/ui/label", () => ({
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    className?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("#/components/ui/password-input", () => ({
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
}));

import { DeviceSetupAuthPanel } from "#/components/block/loginSection/DeviceSetupAuthPanel";

describe("DeviceSetupAuthPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders username input", () => {
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Masukkan username")).toBeDefined();
  });

  it("renders password input", () => {
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("masukkan password")).toBeDefined();
  });

  it("shows error message when error is provided", () => {
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error="Invalid credentials"
        loading={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Invalid credentials")).toBeDefined();
  });

  it("shows loading state when loading is true", () => {
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={true}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("loading-state")).toBeDefined();
  });

  it("shows Lanjut when not loading", () => {
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Lanjut")).toBeDefined();
  });

  it("calls onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Batal"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses custom cancelLabel", () => {
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        cancelLabel="Kembali"
      />,
    );
    expect(screen.getByText("Kembali")).toBeDefined();
  });

  it("calls onUsernameChange when username input changes", () => {
    const onUsernameChange = vi.fn();
    render(
      <DeviceSetupAuthPanel
        username=""
        password=""
        error={null}
        loading={false}
        onUsernameChange={onUsernameChange}
        onPasswordChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Masukkan username"), {
      target: { value: "admin" },
    });
    expect(onUsernameChange).toHaveBeenCalledWith("admin");
  });
});
