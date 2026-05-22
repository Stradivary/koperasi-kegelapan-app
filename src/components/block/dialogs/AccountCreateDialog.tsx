import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Label } from "#/components/ui/label.tsx";
import { PasswordInput } from "#/components/ui/password-input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateAccountFormData {
  tenantId: string;
  username: string;
  password: string;
  role: string;
}

export interface CreateAccountFieldError {
  field: string;
  message: string;
}

export interface CreateAccountError {
  errors: CreateAccountFieldError[];
}

export interface TenantOption {
  tenantId: string;
  name: string;
  slug: string;
}

export interface AccountCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAccountFormData) => void;
  isSubmitting: boolean;
  error: CreateAccountError | null;
  tenants: TenantOption[];
  tenantsLoading: boolean;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "station", label: "Station" },
  { value: "gate", label: "Gate" },
  { value: "terminal", label: "Terminal" },
  { value: "scout", label: "Scout" },
  { value: "superadmin", label: "Superadmin" },
];

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 50) {
    return "Username must be between 3 and 50 characters";
  }
  if (/\s/.test(username)) {
    return "Username must not contain spaces";
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return "Username must contain only lowercase letters, digits, underscores, and hyphens";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return "Password must be between 8 and 128 characters";
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
  tenants,
  tenantsLoading,
}: AccountCreateDialogProps) {
  const [tenantId, setTenantId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTenantId("");
      setUsername("");
      setPassword("");
      setRole("");
      setTouched({});
    }
  }, [open]);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string | null> = {};
    errors.tenantId = tenantId ? null : "Tenant is required";
    errors.username = username ? validateUsername(username) : "Username is required";
    errors.password = password ? validatePassword(password) : "Password is required";
    errors.role = role ? null : "Role is required";
    return errors;
  }, [tenantId, username, password, role]);

  const hasValidationErrors = Object.values(validationErrors).some((e) => e !== null);

  const getServerError = useCallback(
    (field: string): string | null => {
      if (!error?.errors) return null;
      const fieldError = error.errors.find((e) => e.field === field);
      return fieldError?.message ?? null;
    },
    [error],
  );

  const getFieldError = useCallback(
    (field: string): string | null => {
      const serverErr = getServerError(field);
      if (serverErr) return serverErr;
      if (touched[field]) {
        return validationErrors[field] ?? null;
      }
      return null;
    },
    [touched, validationErrors, getServerError],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      setTouched({
        tenantId: true,
        username: true,
        password: true,
        role: true,
      });

      if (hasValidationErrors) return;

      onSubmit({ tenantId, username, password, role });
    },
    [tenantId, username, password, role, hasValidationErrors, onSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Account</DialogTitle>
          <DialogDescription>Create a new account for a tenant.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Tenant */}
          <div className="grid gap-2">
            <Label htmlFor="account-tenant">Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger id="account-tenant" aria-invalid={!!getFieldError("tenantId")}>
                <SelectValue placeholder={tenantsLoading ? "Loading..." : "Select tenant"} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.tenantId} value={t.tenantId}>
                    {t.name} ({t.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getFieldError("tenantId") && (
              <p className="text-sm text-destructive">{getFieldError("tenantId")}</p>
            )}
          </div>

          {/* Username */}
          <div className="grid gap-2">
            <Label htmlFor="account-username">Username</Label>
            <Input
              id="account-username"
              placeholder="e.g. admin-station1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => handleBlur("username")}
              aria-invalid={!!getFieldError("username")}
              autoComplete="off"
            />
            {getFieldError("username") && (
              <p className="text-sm text-destructive">{getFieldError("username")}</p>
            )}
          </div>

          {/* Password */}
          <div className="grid gap-2">
            <Label htmlFor="account-password">Password</Label>
            <PasswordInput
              id="account-password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleBlur("password")}
              aria-invalid={!!getFieldError("password")}
              autoComplete="new-password"
            />
            {getFieldError("password") && (
              <p className="text-sm text-destructive">{getFieldError("password")}</p>
            )}
          </div>

          {/* Role */}
          <div className="grid gap-2">
            <Label htmlFor="account-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="account-role" aria-invalid={!!getFieldError("role")}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {VALID_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getFieldError("role") && (
              <p className="text-sm text-destructive">{getFieldError("role")}</p>
            )}
          </div>

          {/* General server error */}
          {error?.errors?.some((e) => e.field === "general") && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2">
              <p className="text-sm text-destructive">
                {error.errors.find((e) => e.field === "general")?.message}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
