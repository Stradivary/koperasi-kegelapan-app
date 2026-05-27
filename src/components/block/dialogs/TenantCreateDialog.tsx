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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { createSlug, SLUG_MIN_LENGTH, SLUG_MAX_LENGTH } from "#/lib/slugValidation.ts";

// --- Types ---

export interface CreateTenantRequest {
  slug: string;
  name: string;
  timezone: string;
  adminUsername: string;
  adminPassword: string;
}

export interface CreateTenantFieldError {
  field: string;
  message: string;
}

export interface CreateTenantError {
  errors: CreateTenantFieldError[];
}

export interface TenantCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateTenantRequest) => void;
  isSubmitting: boolean;
  error: CreateTenantError | null;
}

// --- Validation ---

export function validateSlug(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `Slug must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters`;
  }
  if (/[^a-z0-9-]/.test(slug)) {
    return "Slug must contain only lowercase letters, digits, and hyphens";
  }
  if (/--/.test(slug)) {
    return "Slug must not contain consecutive hyphens";
  }
  if (!/^[a-z0-9]/.test(slug) || !/[a-z0-9]$/.test(slug)) {
    return "Slug must start and end with a letter or digit";
  }
  return null;
}

export function validateName(name: string): string | null {
  if (name.length < 2 || name.length > 100) {
    return "Name must be between 2 and 100 characters";
  }
  if (!/\S/.test(name)) {
    return "Name must contain at least one non-whitespace character";
  }
  return null;
}

export function validateTimezone(timezone: string): string | null {
  if (!timezone || timezone.length === 0) {
    return "Timezone is required";
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return "Must be a valid IANA timezone";
  }
  return null;
}

export function validateAdminUsername(username: string): string | null {
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

export function validateAdminPassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return "Password must be between 8 and 128 characters";
  }
  return null;
}

/**
 * Auto-generate a slug from a tenant name.
 * Delegates to the shared createSlug utility.
 */
export function generateSlugFromName(name: string): string {
  return createSlug(name);
}

// --- Timezone list ---

function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    // Fallback for environments that don't support Intl.supportedValuesOf
    return [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Jakarta",
      "Asia/Singapore",
      "Australia/Sydney",
      "Pacific/Auckland",
    ];
  }
}

// --- Component ---

export function TenantCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: Readonly<TenantCreateDialogProps>) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [timezone, setTimezone] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const timezones = useMemo(() => getTimezones(), []);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
      setSlugManuallyEdited(false);
      setTimezone("");
      setAdminUsername("");
      setAdminPassword("");
      setTouched({});
    }
  }, [open]);

  // Auto-generate slug from name (unless manually edited)
  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugManuallyEdited) {
        setSlug(generateSlugFromName(value));
      }
    },
    [slugManuallyEdited],
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlug(value);
    setSlugManuallyEdited(true);
  }, []);

  // Mark field as touched on blur
  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  // Client-side validation
  const validationErrors = useMemo(() => {
    const errors: Record<string, string | null> = {};
    errors.name = validateName(name);
    errors.slug = validateSlug(slug);
    errors.timezone = validateTimezone(timezone);
    errors.adminUsername = validateAdminUsername(adminUsername);
    errors.adminPassword = validateAdminPassword(adminPassword);
    return errors;
  }, [name, slug, timezone, adminUsername, adminPassword]);

  const hasValidationErrors = Object.values(validationErrors).some((e) => e !== null);

  // Get server error for a specific field
  const getServerError = useCallback(
    (field: string): string | null => {
      if (!error?.errors) return null;
      const fieldError = error.errors.find((e) => e.field === field);
      return fieldError?.message ?? null;
    },
    [error],
  );

  // Get the displayed error for a field (client-side if touched, or server-side)
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
    (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Mark all fields as touched
      setTouched({
        name: true,
        slug: true,
        timezone: true,
        adminUsername: true,
        adminPassword: true,
      });

      if (hasValidationErrors) return;

      onSubmit({
        slug,
        name,
        timezone,
        adminUsername,
        adminPassword,
      });
    },
    [slug, name, timezone, adminUsername, adminPassword, hasValidationErrors, onSubmit],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Tenant</DialogTitle>
          <DialogDescription>Create a new tenant with an initial admin account.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Tenant Name */}
          <div className="grid gap-2">
            <Label htmlFor="tenant-name">Tenant Name</Label>
            <Input
              id="tenant-name"
              placeholder="My Koperasi"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => handleBlur("name")}
              aria-invalid={!!getFieldError("name")}
              aria-describedby={getFieldError("name") ? "name-error" : undefined}
            />
            {getFieldError("name") && (
              <p id="name-error" className="text-sm text-destructive">
                {getFieldError("name")}
              </p>
            )}
          </div>

          {/* Slug */}
          <div className="grid gap-2">
            <Label htmlFor="tenant-slug">Slug</Label>
            <Input
              id="tenant-slug"
              placeholder="my-koperasi"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              onBlur={() => handleBlur("slug")}
              aria-invalid={!!getFieldError("slug")}
              aria-describedby={getFieldError("slug") ? "slug-error" : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Auto-generated from name. You can edit it manually.
            </p>
            {getFieldError("slug") && (
              <p id="slug-error" className="text-sm text-destructive">
                {getFieldError("slug")}
              </p>
            )}
          </div>

          {/* Timezone */}
          <div className="grid gap-2">
            <Label htmlFor="tenant-timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger
                id="tenant-timezone"
                className="w-full"
                aria-invalid={!!getFieldError("timezone")}
                aria-describedby={getFieldError("timezone") ? "timezone-error" : undefined}
                onBlur={() => handleBlur("timezone")}
              >
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getFieldError("timezone") && (
              <p id="timezone-error" className="text-sm text-destructive">
                {getFieldError("timezone")}
              </p>
            )}
          </div>

          {/* Admin Username */}
          <div className="grid gap-2">
            <Label htmlFor="admin-username">Admin Username</Label>
            <Input
              id="admin-username"
              placeholder="admin"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              onBlur={() => handleBlur("adminUsername")}
              aria-invalid={!!getFieldError("adminUsername")}
              aria-describedby={getFieldError("adminUsername") ? "username-error" : undefined}
            />
            {getFieldError("adminUsername") && (
              <p id="username-error" className="text-sm text-destructive">
                {getFieldError("adminUsername")}
              </p>
            )}
          </div>

          {/* Admin Password */}
          <div className="grid gap-2">
            <Label htmlFor="admin-password">Admin Password</Label>
            <Input
              id="admin-password"
              type="password"
              placeholder="masukkan password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onBlur={() => handleBlur("adminPassword")}
              aria-invalid={!!getFieldError("adminPassword")}
              aria-describedby={getFieldError("adminPassword") ? "password-error" : undefined}
            />
            {getFieldError("adminPassword") && (
              <p id="password-error" className="text-sm text-destructive">
                {getFieldError("adminPassword")}
              </p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={hasValidationErrors || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
