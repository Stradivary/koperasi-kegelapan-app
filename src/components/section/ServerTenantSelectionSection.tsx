import { useState, useRef, useCallback } from "react";
import { ArrowLeft, Search, RotateCcw } from "lucide-react";
import { useServerTenantSearch, type TenantSearchResult } from "../../hooks/useServerTenantSearch";
import { tenantContextStore, localTenantConfigStore } from "../../lib/indexeddb";
import { getDeviceFingerprint } from "../../lib/getOrCreateDeviceId";
import { API_BASE_URL, setCurrentDeviceId } from "../../lib/api";
import { AuthLayout } from "../layout/AuthLayout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { LoadingState } from "../block/LoadingState";

interface ServerTenantSelectionProps {
  onComplete: (tenantId: string, role: string) => void;
  onBack: () => void;
}

const AUTH_TIMEOUT_MS = 10_000;

export function ServerTenantSelectionSection({ onComplete, onBack }: ServerTenantSelectionProps) {
  const { query, setQuery, results, loading, error } = useServerTenantSearch();
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null);

  // Auth form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [pendingAuthData, setPendingAuthData] = useState<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountId: string;
    role: string;
    deviceId?: string;
  } | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleTenantSelect(tenant: TenantSearchResult) {
    setSelectedTenant(tenant);
    setUsername("");
    setPassword("");
    setAuthError(null);
    setStorageError(false);
    setPendingAuthData(null);
  }

  const storeAndComplete = useCallback(
    async (data: {
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
      accountId: string;
      role: string;
      deviceId?: string;
    }) => {
      try {
        const fingerprintId = await getDeviceFingerprint();
        // Always use local fingerprint as deviceId for context validation
        // useTenantContext validates context.deviceId === runtime fingerprint
        await tenantContextStore.put({
          tenantId: data.tenantId,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          deviceId: fingerprintId,
          accountId: data.accountId,
          role: data.role,
          terminalId: 0,
          updatedAt: Date.now(),
        });

        // Ensure a LocalTenantConfig exists so sync/IndexedDB operations work.
        // Server-authenticated tenants need a local config entry with mode "synced".
        const existingConfig = await localTenantConfigStore.get(data.tenantId);
        if (!existingConfig) {
          await localTenantConfigStore.put({
            tenantId: data.tenantId,
            slug: data.tenantSlug,
            name: data.tenantName,
            timezone: "Asia/Jakarta",
            mode: "synced",
            createdAt: Date.now(),
            syncedAt: Date.now(),
            serverTenantId: data.tenantId,
          });
        }

        // Set deviceId in API client for all subsequent requests
        setCurrentDeviceId(fingerprintId);
        onComplete(data.tenantId, data.role);
      } catch {
        setPendingAuthData(data);
        setStorageError(true);
      }
    },
    [onComplete],
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setStorageError(false);
    setAuthLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    try {
      // Generate device fingerprint for multi-device login support
      const deviceFingerprintHash = await getDeviceFingerprint();

      const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: selectedTenant!.slug,
          username,
          password,
          deviceFingerprint: {
            hash: deviceFingerprintHash,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        await storeAndComplete(data);
        return;
      }

      // Handle error responses
      const body = await res.json().catch(() => ({ error: "" }));
      const errorMsg = (body?.error ?? "").toLowerCase();

      if (res.status === 401 && errorMsg.includes("inactive")) {
        setAuthError("Tenant tidak lagi aktif");
      } else {
        setAuthError("Username atau password salah");
      }

      // Clear password, keep username, focus password input
      setPassword("");
      setTimeout(() => passwordRef.current?.focus(), 0);
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        setAuthError("Tidak dapat terhubung ke server");
      } else {
        setAuthError("Tidak dapat terhubung ke server");
      }
      setPassword("");
      setTimeout(() => passwordRef.current?.focus(), 0);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRetryStorage() {
    if (!pendingAuthData) return;
    setStorageError(false);
    await storeAndComplete(pendingAuthData);
  }

  // If a tenant is selected, show the login form
  if (selectedTenant) {
    return (
      <AuthLayout variant="brand-dark" headerSubtitle="Login ke Koperasi">
        <div>
          <h1 className="type-h5 text-foreground">{selectedTenant.name}</h1>
          <p className="type-body2 text-signal-text-secondary mt-0.5">{selectedTenant.slug}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="server-username" className="type-body1-bold">
              Username
            </Label>
            <Input
              id="server-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={50}
              autoComplete="username"
              required
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="server-password" className="type-body1-bold">
              Password
            </Label>
            <Input
              id="server-password"
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              autoComplete="current-password"
              required
              className="h-11"
            />
          </div>

          {authError && (
            <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
              <p className="type-body2 text-signal-error">{authError}</p>
            </div>
          )}

          {storageError && (
            <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2 space-y-2">
              <p className="type-body2 text-signal-error">Sesi tidak dapat disimpan. Coba lagi.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryStorage}
                className="w-full"
              >
                <RotateCcw size={14} className="mr-1.5" />
                Coba lagi
              </Button>
            </div>
          )}

          <Button
            type="submit"
            disabled={authLoading}
            className="w-full h-12 text-white type-title-bold bg-brand-dark hover:bg-brand-dark/90"
          >
            {authLoading ? <LoadingState variant="button" text="Masuk..." /> : "Masuk"}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          onClick={() => setSelectedTenant(null)}
          className="w-full"
        >
          <ArrowLeft size={15} className="mr-1.5" />
          Kembali ke pencarian
        </Button>
      </AuthLayout>
    );
  }

  const showNoResults = !loading && query.length >= 2 && results.length === 0 && !error;

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Pilih Koperasi">
      <div>
        <h1 className="type-h5 text-foreground">Cari Koperasi</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Temukan koperasi yang terdaftar di server
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          placeholder="Cari koperasi..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 pl-9"
        />
      </div>

      {/* Loading indicator */}
      {loading && <LoadingState variant="section" text="Mencari..." />}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
          <p className="type-body2 text-signal-error">{error}</p>
        </div>
      )}

      {/* No results message */}
      {showNoResults && (
        <div className="py-6 text-center">
          <p className="type-body2 text-muted-foreground">Tidak ada koperasi yang cocok</p>
        </div>
      )}

      {/* Tenant cards */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((tenant) => (
            <button
              key={tenant.tenantId}
              type="button"
              onClick={() => handleTenantSelect(tenant)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border border-border hover:bg-accent active:scale-[0.98] transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="type-body1-bold text-foreground truncate">{tenant.name}</p>
                <p className="type-body2 text-muted-foreground truncate">{tenant.slug}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Back button */}
      <Button type="button" variant="outline" onClick={onBack} className="w-full">
        <ArrowLeft size={15} className="mr-1.5" />
        Kembali
      </Button>
    </AuthLayout>
  );
}
