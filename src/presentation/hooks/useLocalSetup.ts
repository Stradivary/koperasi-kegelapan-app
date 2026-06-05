import { useCallback, useEffect, useState } from "react";
import {
  getTenantContextStore,
  getLocalAccountStore,
} from "#/infrastructure/persistence/dexie/indexeddb.lazy";
import { isSlugTaken, setupLocalTenant } from "#/infrastructure/persistence/dexie/tenantRepository";
import { createSlug, validateSlugFormat } from "#/core/validation/slugValidation";
import { getDeviceFingerprint } from "#/infrastructure/device/getOrCreateDeviceId";
import { useTenantSync } from "#/presentation/hooks/useTenantSync";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SetupStep = "tenant" | "admin" | "done";

export interface UseLocalSetupOptions {
  onComplete: (tenantId: string, role: string) => void;
}

export interface UseLocalSetupReturn {
  step: SetupStep;
  setStep: (step: SetupStep) => void;
  tenantName: string;
  setTenantName: (v: string) => void;
  tenantSlug: string;
  setTenantSlug: (v: string) => void;
  slugError: string | null;
  adminUsername: string;
  setAdminUsername: (v: string) => void;
  adminPassword: string;
  setAdminPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  error: string | null;
  loading: boolean;
  handleNextStep: () => Promise<void>;
  handleSetup: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLocalSetup(options: UseLocalSetupOptions): UseLocalSetupReturn {
  const { onComplete } = options;

  const [step, setStep] = useState<SetupStep>("tenant");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { syncToServer } = useTenantSync();

  // Validate slug uniqueness against local tenants and remote server on change
  const validateSlug = useCallback(async (slug: string) => {
    if (!slug) {
      setSlugError(null);
      return;
    }

    const formatError = validateSlugFormat(slug);
    if (formatError) {
      setSlugError(formatError);
      return;
    }

    const result = await isSlugTaken(slug);
    if (result.taken) {
      const sourceMsg =
        result.source === "remote"
          ? `Slug "${slug}" sudah terdaftar di server.`
          : `Slug "${slug}" sudah digunakan oleh koperasi lain.`;
      setSlugError(sourceMsg);
    } else {
      setSlugError(null);
    }
  }, []);

  // Debounced slug validation (300 ms)
  useEffect(() => {
    const effectiveSlug = tenantSlug || createSlug(tenantName);
    if (!effectiveSlug) return;
    const timer = setTimeout(() => validateSlug(effectiveSlug), 300);
    return () => clearTimeout(timer);
  }, [tenantSlug, tenantName, validateSlug]);

  /**
   * Validates slug format and uniqueness, then advances to the admin step.
   * Pre-populates adminUsername with the slug-derived default.
   */
  async function handleNextStep(): Promise<void> {
    const slug = tenantSlug || createSlug(tenantName);

    const formatError = validateSlugFormat(slug);
    if (formatError) {
      setSlugError(formatError);
      return;
    }

    const result = await isSlugTaken(slug);
    if (result.taken) {
      const sourceMsg =
        result.source === "remote"
          ? `Slug "${slug}" sudah terdaftar di server.`
          : `Slug "${slug}" sudah digunakan oleh koperasi lain.`;
      setSlugError(sourceMsg);
      return;
    }

    setAdminUsername(`${slug}-admin`);
    setStep("admin");
  }

  /**
   * Validates passwords, creates the local tenant, writes tenant context,
   * optionally syncs to server (fire-and-forget), then completes setup.
   */
  async function handleSetup(): Promise<void> {
    if (adminPassword !== confirmPassword) {
      setError("Password tidak cocok");
      return;
    }
    if (adminPassword.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cfg = await setupLocalTenant({
        name: tenantName,
        slug: tenantSlug || undefined,
        adminUsername,
        adminPassword,
      });

      const tenantContextStore = await getTenantContextStore();
      await tenantContextStore.put({
        tenantId: cfg.tenantId,
        tenantSlug: cfg.slug,
        tenantName: cfg.name,
        deviceId: await getDeviceFingerprint(),
        accountId: cfg.tenantId + "-admin",
        role: "admin",
        canAccessStation: true,
        terminalId: 0,
        updatedAt: Date.now(),
      });

      // Auto-sync to server if online (fire-and-forget, don't block setup)
      if (navigator.onLine) {
        const localAccountStore = await getLocalAccountStore();
        const accounts = await localAccountStore.getByTenant(cfg.tenantId);
        const admin = accounts.find((a) => a.role === "admin");
        if (admin) {
          syncToServer(cfg, admin.passwordHash).catch(() => {
            // Sync failed silently - user can retry from admin panel
          });
        }
      }

      setStep("done");
      setTimeout(() => onComplete(cfg.tenantId, "admin"), 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return {
    step,
    setStep,
    tenantName,
    setTenantName,
    tenantSlug,
    setTenantSlug,
    slugError,
    adminUsername,
    setAdminUsername,
    adminPassword,
    setAdminPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    loading,
    handleNextStep,
    handleSetup,
  };
}
