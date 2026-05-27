// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub validateSlugFormat
vi.mock("#/lib/slugValidation", () => ({
  validateSlugFormat: vi.fn().mockReturnValue(null),
}));

// Stub AlertDialog components
vi.mock("../../../ui/alert-dialog", () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogMedia: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("../../../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("../../../ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="alert-triangle" />,
}));

import { SyncConflictDialog } from "../SyncConflictDialog";
import type { SyncConflict } from "#/hooks/useTenantSync";

function makeConflict(conflictType: SyncConflict["conflictType"] = "slug_only"): SyncConflict {
  return {
    conflictType,
    existingSlug: "existing-slug",
    existingTenantName: "Existing Tenant",
    currentSlug: "my-slug",
    currentAdminUsername: "admin-user",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SyncConflictDialog", () => {
  describe("slug_only conflict", () => {
    it("renders the dialog when open", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByTestId("alert-dialog")).toBeDefined();
    });

    it("shows slug conflict title", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByText("Slug Sudah Digunakan")).toBeDefined();
    });

    it("shows slug input field", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByText("Slug Baru")).toBeDefined();
    });

    it("does not show username field for slug_only conflict", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.queryByText("Username Admin Baru")).toBeNull();
    });
  });

  describe("admin_only conflict", () => {
    it("shows admin conflict title", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("admin_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByText("Username Admin Sudah Digunakan")).toBeDefined();
    });

    it("shows username field but not slug field", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("admin_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByText("Username Admin Baru")).toBeDefined();
      expect(screen.queryByText("Slug Baru")).toBeNull();
    });
  });

  describe("slug_and_admin conflict", () => {
    it("shows both slug and admin conflict title", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_and_admin")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByText("Slug & Admin Sudah Digunakan")).toBeDefined();
    });

    it("shows both slug and username fields", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_and_admin")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.getByText("Slug Baru")).toBeDefined();
      expect(screen.getByText("Username Admin Baru")).toBeDefined();
    });
  });

  describe("interactions", () => {
    it("calls onDismiss when Batal button is clicked", async () => {
      const onDismiss = vi.fn();
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={onDismiss}
          onRetryWithChanges={vi.fn()}
        />,
      );
      await userEvent.click(screen.getByText("Batal"));
      expect(onDismiss).toHaveBeenCalledOnce();
    });

    it("calls onRetryWithChanges with new slug when retry is clicked", async () => {
      const { validateSlugFormat } = await import("#/lib/slugValidation");
      vi.mocked(validateSlugFormat).mockReturnValue(null);

      const onRetryWithChanges = vi.fn();
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={onRetryWithChanges}
        />,
      );

      const slugInput = screen.getByPlaceholderText("slug-baru");
      await userEvent.clear(slugInput);
      await userEvent.type(slugInput, "new-slug");

      await userEvent.click(screen.getByText("Coba Lagi"));
      expect(onRetryWithChanges).toHaveBeenCalledWith("new-slug", "admin-user");
    });

    it("shows error when slug is same as current", async () => {
      const { validateSlugFormat } = await import("#/lib/slugValidation");
      vi.mocked(validateSlugFormat).mockReturnValue(null);

      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );

      // Don't change the slug — it defaults to currentSlug
      await userEvent.click(screen.getByText("Coba Lagi"));
      expect(screen.getByText("Slug harus berbeda dari yang sebelumnya")).toBeDefined();
    });

    it("disables buttons when isRetrying is true", () => {
      render(
        <SyncConflictDialog
          open={true}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
          isRetrying={true}
        />,
      );
      expect(screen.getByText("Menyinkronkan...").closest("button")).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByText("Batal").closest("button")).toHaveProperty("disabled", true);
    });

    it("does not render when open is false", () => {
      render(
        <SyncConflictDialog
          open={false}
          conflict={makeConflict("slug_only")}
          onDismiss={vi.fn()}
          onRetryWithChanges={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("alert-dialog")).toBeNull();
    });
  });
});
