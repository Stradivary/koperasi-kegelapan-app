// @vitest-environment jsdom
/**
 * Tests for src/components/block/dialogs/AccountCreateDialog.tsx
 * Covers: form rendering, validation, submit, server errors, reset on open
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// Mock all UI primitives to simple HTML equivalents
vi.mock("#/components/ui/dialog.tsx", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("#/components/ui/input.tsx", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("#/components/ui/button.tsx", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("#/components/ui/label.tsx", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock("#/components/ui/password-input.tsx", () => ({
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="password" {...props} />
  ),
}));

vi.mock("#/components/ui/select.tsx", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="select" data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ onValueChange?: (v: string) => void }>,
              { onValueChange },
            )
          : child,
      )}
    </div>
  ),
  SelectTrigger: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
    "aria-invalid"?: boolean;
  }) => (
    <div id={id} data-testid={`trigger-${id}`}>
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select-content">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ onValueChange?: (v: string) => void }>,
              { onValueChange },
            )
          : child,
      )}
    </div>
  ),
  SelectItem: ({
    value,
    children,
    onValueChange,
  }: {
    value: string;
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) => (
    <button data-testid={`option-${value}`} onClick={() => onValueChange?.(value)}>
      {children}
    </button>
  ),
}));

import {
  AccountCreateDialog,
  type AccountCreateDialogProps,
} from "#/components/block/dialogs/AccountCreateDialog";

const tenants = [
  { tenantId: "t-1", name: "Tenant One", slug: "tenant-one" },
  { tenantId: "t-2", name: "Tenant Two", slug: "tenant-two" },
];

function defaultProps(overrides: Partial<AccountCreateDialogProps> = {}): AccountCreateDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    isSubmitting: false,
    error: null,
    tenants,
    tenantsLoading: false,
    ...overrides,
  };
}

describe("AccountCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when open is false", () => {
    render(<AccountCreateDialog {...defaultProps({ open: false })} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders dialog when open is true", () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    expect(screen.getByTestId("dialog")).toBeDefined();
  });

  it("renders username input", () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    expect(screen.getByPlaceholderText("e.g. admin-station1")).toBeDefined();
  });

  it("renders password input", () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    expect(screen.getByPlaceholderText("Min. 8 characters")).toBeDefined();
  });

  it("renders Create Account submit button", () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    expect(screen.getByRole("button", { name: "Create Account" })).toBeDefined();
  });

  it("renders Cancel button", () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    expect(screen.getByText("Cancel")).toBeDefined();
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<AccountCreateDialog {...defaultProps({ onOpenChange })} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows submitting state on button when isSubmitting is true", () => {
    render(<AccountCreateDialog {...defaultProps({ isSubmitting: true })} />);
    expect(screen.getByText("Creating...")).toBeDefined();
  });

  it("disables buttons when isSubmitting is true", () => {
    render(<AccountCreateDialog {...defaultProps({ isSubmitting: true })} />);
    const cancelBtn = screen.getByText("Cancel").closest("button");
    expect(cancelBtn?.disabled).toBe(true);
  });

  it("shows username validation error after blur with short username", async () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    const input = screen.getByPlaceholderText("e.g. admin-station1");
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText(/3 and 50 characters/)).toBeDefined();
    });
  });

  it("shows username error for spaces", async () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    const input = screen.getByPlaceholderText("e.g. admin-station1");
    fireEvent.change(input, { target: { value: "user name" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText(/must not contain spaces/)).toBeDefined();
    });
  });

  it("shows username error for invalid characters", async () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    const input = screen.getByPlaceholderText("e.g. admin-station1");
    fireEvent.change(input, { target: { value: "User@Name" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText(/lowercase letters/)).toBeDefined();
    });
  });

  it("shows password validation error after blur with short password", async () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    const input = screen.getByPlaceholderText("Min. 8 characters");
    fireEvent.change(input, { target: { value: "short" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText(/8 and 128 characters/)).toBeDefined();
    });
  });

  it("does not call onSubmit when form has validation errors", () => {
    const onSubmit = vi.fn();
    render(<AccountCreateDialog {...defaultProps({ onSubmit })} />);
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays server-side field error", () => {
    const error = { errors: [{ field: "username", message: "Username taken" }] };
    render(<AccountCreateDialog {...defaultProps({ error })} />);
    expect(screen.getByText("Username taken")).toBeDefined();
  });

  it("displays general server error", () => {
    const error = { errors: [{ field: "general", message: "Server error occurred" }] };
    render(<AccountCreateDialog {...defaultProps({ error })} />);
    expect(screen.getByText("Server error occurred")).toBeDefined();
  });

  it("shows Loading... placeholder when tenantsLoading is true", () => {
    render(<AccountCreateDialog {...defaultProps({ tenantsLoading: true })} />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders tenant options", () => {
    render(<AccountCreateDialog {...defaultProps()} />);
    expect(screen.getByTestId("option-t-1")).toBeDefined();
    expect(screen.getByTestId("option-t-2")).toBeDefined();
  });
});
