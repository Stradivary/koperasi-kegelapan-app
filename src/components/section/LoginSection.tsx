import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  DoorOpen,
  MonitorSmartphone,
  BookOpen,
  Settings,
  Layers,
  Plus,
  Search,
  ArrowLeft,
  WifiOff,
} from "lucide-react";
import { tenantContextStore, localTenantConfigStore } from "../../lib/indexeddb";
import { localLogin, cacheServerCredentials } from "../../lib/localTenant";
import { getDeviceFingerprint } from "../../lib/getOrCreateDeviceId";
import { localDb } from "../../db/local-db";
import { BRAND } from "../../lib/brand";
import { API_BASE_URL, setCurrentDeviceId, setAccessToken, restoreAuthState } from "../../lib/api";
import { issueAndCacheLocalSessionGrant } from "../../lib/localSessionGrant";
import { AuthLayout } from "../layout/AuthLayout";
import { LocalSetupSection } from "./LocalSetupSection";
import { useServerTenantSearch, type TenantSearchResult } from "../../hooks/useServerTenantSearch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Label } from "../ui/label";
import { LoadingState } from "../block/LoadingState";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

type LoginMode = "detecting" | "login" | "setup" | "device-setup" | "server-browse";
type DeviceSetupStep = "auth" | "pick-role";

const NO_AUTH_ROLES = ["gate", "terminal", "scout"] as const;
const AUTH_TIMEOUT_MS = 10_000;

export function LoginSection() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>("detecting");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Device setup state
  const [setupStep, setSetupStep] = useState<DeviceSetupStep>("auth");
  const [pendingContext, setPendingContext] = useState<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    accountId: string;
  } | null>(null);

  // Server browse state (for "Hubungkan ke Server" flow)
  const [selectedServerTenant, setSelectedServerTenant] = useState<TenantSearchResult | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function detectMode() {
      // Auto-boot: if this device already has an active session, redirect back
      const contexts = await tenantContextStore.getAll();
      if (contexts.length > 0) {
        // Prefer no-auth roles (dedicated devices), then fall back to most recent context
        const noAuthCtx = contexts.find((c) =>
          (NO_AUTH_ROLES as readonly string[]).includes(c.role),
        );
        const activeCtx =
          noAuthCtx ?? contexts.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
        if (activeCtx) {
          // Restore deviceId and access token from IndexedDB
          if (activeCtx.deviceId) {
            await restoreAuthState(activeCtx.deviceId);
          }
          const roleRoutes: Record<string, string> = {
            terminal: `/tenant/${activeCtx.tenantId}/terminal`,
            gate: `/tenant/${activeCtx.tenantId}/gate`,
            kiosk: `/tenant/${activeCtx.tenantId}/kiosk`,
            scout: `/tenant/${activeCtx.tenantId}/scout`,
            station: `/tenant/${activeCtx.tenantId}/station`,
            admin: `/tenant/${activeCtx.tenantId}/admin`,
          };
          navigate({ to: roleRoutes[activeCtx.role] ?? "/", replace: true });
          return;
        }
      }

      setMode("login");
    }
    detectMode();
  }, [navigate]);

  function redirectToRole(tenantId: string, role: string) {
    const roleRoutes: Record<string, string> = {
      terminal: `/tenant/${tenantId}/terminal`,
      gate: `/tenant/${tenantId}/gate`,
      kiosk: `/tenant/${tenantId}/kiosk`,
      scout: `/tenant/${tenantId}/scout`,
      station: `/tenant/${tenantId}/station`,
      admin: `/tenant/${tenantId}/admin`,
    };
    navigate({ to: roleRoutes[role] ?? "/" });
  }

  function enterDeviceSetup() {
    setError(null);
    setUsername("");
    setPassword("");
    setSetupStep("auth");
    setPendingContext(null);
    setMode("device-setup");
  }

  /**
   * Unified login handler: local-first → server fallback → cache credentials.
   * Works with optional tenantSlug for scoped server login.
   */
  async function handleUnifiedLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Try local login first (works offline)
      const effectiveSlug = selectedServerTenant?.slug ?? (tenantSlug || undefined);
      const localResult = await localLogin(username, password, effectiveSlug);
      if (localResult) {
        const fingerprintId = await getDeviceFingerprint();
        await tenantContextStore.put({
          tenantId: localResult.tenantId,
          tenantSlug: localResult.tenantSlug,
          tenantName: localResult.tenantName,
          deviceId: fingerprintId,
          accountId: localResult.accountId,
          role: localResult.role,
          terminalId: 0,
          updatedAt: Date.now(),
        });
        setCurrentDeviceId(fingerprintId);

        // Pre-generate and cache session grant so it's available immediately
        // when the role page loads (avoids race with useSessionGrant hook)
        issueAndCacheLocalSessionGrant(
          localResult.tenantId,
          localResult.accountId,
          fingerprintId,
          localResult.role,
        ).catch(() => {
          // Non-critical — useSessionGrant will handle fallback
        });

        redirectToRole(localResult.tenantId, localResult.role);
        return;
      }

      // 2. If offline and local login failed, show appropriate error
      if (!navigator.onLine) {
        setError("Username atau password salah (offline — hanya akun lokal yang tersedia)");
        return;
      }

      // 3. Try server login as fallback (online only)
      const fingerprintHash = await getDeviceFingerprint();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

      const body: Record<string, unknown> = {
        username,
        password,
        deviceFingerprint: {
          hash: fingerprintHash,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      };

      // Scope to tenant slug if provided (from server browse or manual input)
      if (effectiveSlug) {
        body.tenantSlug = effectiveSlug;
      }

      const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();

        // Validate that the server response matches the selected tenant
        if (effectiveSlug && data.tenantSlug !== effectiveSlug) {
          setError("Akun ini bukan milik koperasi yang dipilih");
          return;
        }

        const deviceId = fingerprintHash;

        // Store tenant context
        await tenantContextStore.put({
          tenantId: data.tenantId,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          deviceId,
          accountId: data.accountId,
          role: data.role,
          terminalId: 0,
          updatedAt: Date.now(),
        });

        // Ensure LocalTenantConfig exists for sync/offline operations
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

        // Store device registration info in Dexie for sync engine use
        if (data.deviceId) {
          await localDb.deviceInfo.put({
            deviceId: data.deviceId,
            tenantId: data.tenantId,
            fingerprintHash,
            registeredAt: Date.now(),
          });
        }

        setCurrentDeviceId(deviceId);

        if (data.accessToken) {
          setAccessToken(data.accessToken);
        }

        // Cache credentials locally for offline replay (fire-and-forget)
        cacheServerCredentials({
          tenantId: data.tenantId,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          accountId: data.accountId,
          role: data.role,
          username,
          password,
        }).catch(() => {
          // Non-critical — offline replay won't work but login still succeeds
        });

        redirectToRole(data.tenantId, data.role);
        return;
      }

      // Handle error responses
      const errorBody = await res.json().catch(() => ({ error: "" }));
      const errorMsg = (errorBody?.error ?? "").toLowerCase();

      if (res.status === 401 && errorMsg.includes("inactive")) {
        setError("Tenant tidak lagi aktif");
      } else if (res.status === 404) {
        setError("Koperasi tidak ditemukan");
      } else {
        setError("Username atau password salah");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
      } else {
        setError("Gagal terhubung ke server. Periksa koneksi Anda.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDeviceSetupAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Early offline check: device setup requires internet for initial activation
      // Try local login first to see if cached credentials exist
      const localResult = await localLogin(username, password);

      if (navigator.onLine === false) {
        // Offline: if no cached credentials, show educative message and skip network
        if (!localResult) {
          setError(
            "Perangkat baru wajib terhubung internet untuk aktivasi awal. Hubungkan ke jaringan WiFi atau data seluler, lalu coba lagi.",
          );
          return;
        }
      }

      // Use local result if available
      let result = localResult;

      // If local fails and online, try server + cache
      if (!result && navigator.onLine) {
        const fingerprintHash = await getDeviceFingerprint();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              password,
              deviceFingerprint: {
                hash: fingerprintHash,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
              },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            // Cache for offline use
            await cacheServerCredentials({
              tenantId: data.tenantId,
              tenantSlug: data.tenantSlug,
              tenantName: data.tenantName,
              accountId: data.accountId,
              role: data.role,
              username,
              password,
            });
            result = {
              tenantId: data.tenantId,
              tenantSlug: data.tenantSlug,
              tenantName: data.tenantName,
              accountId: data.accountId,
              role: data.role,
            };
          }
        } catch {
          clearTimeout(timeout);
        }
      }

      if (!result) {
        setError("Username atau password salah");
        return;
      }
      if (!["admin", "station"].includes(result.role)) {
        setError("Diperlukan akun admin atau station untuk mengkonfigurasi perangkat");
        return;
      }
      setPendingContext({
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: result.tenantName,
        accountId: result.accountId,
      });
      setSetupStep("pick-role");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePickDeviceRole(role: "gate" | "terminal" | "scout") {
    if (!pendingContext) return;
    const fingerprintId = await getDeviceFingerprint();
    await tenantContextStore.put({
      ...pendingContext,
      deviceId: fingerprintId,
      role,
      terminalId: 0,
      updatedAt: Date.now(),
    });
    setCurrentDeviceId(fingerprintId);

    // Pre-generate and cache session grant for the device role
    issueAndCacheLocalSessionGrant(
      pendingContext.tenantId,
      pendingContext.accountId,
      fingerprintId,
      role,
    ).catch(() => {
      // Non-critical — useSessionGrant will handle fallback
    });

    redirectToRole(pendingContext.tenantId, role);
  }

  if (mode === "detecting") {
    return <LoadingState variant="page" />;
  }

  if (mode === "setup") {
    return (
      <LocalSetupSection
        onComplete={(tenantId, role) => {
          redirectToRole(tenantId, role);
        }}
        onBack={() => {
          setMode("login");
          setError(null);
        }}
      />
    );
  }

  if (mode === "server-browse") {
    return (
      <ServerBrowsePanel
        onSelect={(tenant) => {
          setSelectedServerTenant(tenant);
          setTenantSlug(tenant.slug);
          setUsername("");
          setPassword("");
          setError(null);
          setMode("login");
          // Focus password after render
          setTimeout(() => passwordRef.current?.focus(), 100);
        }}
        onBack={() => {
          setMode("login");
          setError(null);
        }}
      />
    );
  }

  if (mode === "device-setup") {
    if (setupStep === "pick-role") {
      return (
        <AuthLayout variant="brand-dark">
          <div>
            <h1 className="type-h5 text-foreground">Pilih Peran Perangkat</h1>
            <p className="type-body2 text-signal-text-secondary mt-0.5">
              Perangkat ini akan selalu berjalan dalam peran yang dipilih
            </p>
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => handlePickDeviceRole("gate")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border-2 border-transparent hover:bg-accent active:scale-[0.98] transition-all text-left"
            >
              <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <DoorOpen size={20} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-body1-bold text-foreground">Gerbang (Gate)</p>
                <p className="type-body2 text-muted-foreground">
                  Mencatat waktu masuk ke kartu anggota
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePickDeviceRole("terminal")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border-2 border-transparent hover:bg-accent active:scale-[0.98] transition-all text-left"
            >
              <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <MonitorSmartphone size={20} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-body1-bold text-foreground">Terminal (Exit)</p>
                <p className="type-body2 text-muted-foreground">
                  Menghitung durasi dan memotong saldo anggota
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePickDeviceRole("scout")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border-2 border-transparent hover:bg-accent active:scale-[0.98] transition-all text-left"
            >
              <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <BookOpen size={20} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-body1-bold text-foreground">Buku Saku (Scout)</p>
                <p className="type-body2 text-muted-foreground">
                  Anggota melihat saldo dan riwayat kartu
                </p>
              </div>
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSetupStep("auth");
              setPendingContext(null);
            }}
            className="w-full"
          >
            Kembali
          </Button>
        </AuthLayout>
      );
    }

    // setupStep === 'auth'
    return (
      <AuthLayout variant="brand-dark">
        <div>
          <h1 className="type-h5 text-foreground">Pasang Perangkat</h1>
          <p className="type-body2 text-signal-text-secondary mt-0.5">
            Login sebagai admin untuk mengkonfigurasi perangkat ini
          </p>
        </div>

        <form onSubmit={handleDeviceSetupAuth} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="setup-username" className="type-body1-bold">
              Username Admin
            </Label>
            <Input
              id="setup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-password" className="type-body1-bold">
              Password
            </Label>
            <PasswordInput
              id="setup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="h-11"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
              <p className="type-body2 text-signal-error">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-white type-title-bold bg-brand-dark hover:bg-brand-dark/90"
          >
            {loading ? <LoadingState variant="button" /> : "Lanjut"}
          </Button>
        </form>

        <Button type="button" variant="outline" onClick={() => setMode("login")} className="w-full">
          Batal
        </Button>
      </AuthLayout>
    );
  }

  // ─── Unified Login Form ────────────────────────────────────────────────────

  return (
    <AuthLayout variant="brand-dark">
      <div>
        <h1 className="type-h5 text-foreground">Masuk</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          {selectedServerTenant
            ? `Login ke ${selectedServerTenant.name}`
            : "Masuk dengan akun lokal atau server"}
        </p>
      </div>

      <form onSubmit={handleUnifiedLogin} className="space-y-4">
        {/* Tenant slug field — shown when user picked from server browse or can type manually */}
        <div className="space-y-1.5">
          <Label htmlFor="tenant-slug" className="type-body1-bold">
            Koperasi{" "}
            <span className="text-muted-foreground font-normal type-body2">(opsional)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="tenant-slug"
              type="text"
              placeholder="slug koperasi"
              value={tenantSlug}
              onChange={(e) => {
                setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSelectedServerTenant(null);
              }}
              className="h-11 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => {
                setMode("server-browse");
                setError(null);
              }}
              title="Cari koperasi di server"
            >
              <Search size={16} />
            </Button>
          </div>
          {selectedServerTenant && (
            <p className="type-body2 text-brand-dark">✓ {selectedServerTenant.name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username" className="type-body1-bold">
            Username
          </Label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="type-body1-bold">
            Password
          </Label>
          <PasswordInput
            id="password"
            ref={passwordRef}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-11"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
            <p className="type-body2 text-signal-error">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 text-white type-title-bold bg-brand hover:bg-brand/90"
        >
          {loading ? <LoadingState variant="button" /> : "Masuk"}
        </Button>
      </form>

      <div className="pt-1 border-t space-y-2">
        <Button
          type="button"
          onClick={() => {
            setMode("setup");
            setError(null);
          }}
          variant="outline"
          className="w-full"
        >
          <Plus size={15} />
          Daftarkan koperasi baru
        </Button>

        <Button
          type="button"
          onClick={enterDeviceSetup}
          variant="outline"
          className="w-full text-muted-foreground gap-2"
        >
          <Settings size={15} />
          Pasang Perangkat
        </Button>
      </div>

      <p className="type-body2 text-signal-text-disable text-center">
        {BRAND.APP_NAME} · {BRAND.BYLINE}
      </p>

      <button
        type="button"
        onClick={() => navigate({ to: "/devices" })}
        className="w-full text-center type-body2 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
      >
        <Layers size={13} />
        Lihat tenant terdaftar
      </button>
    </AuthLayout>
  );
}

// ─── Server Browse Panel (inline sub-component) ──────────────────────────────

interface ServerBrowsePanelProps {
  onSelect: (tenant: TenantSearchResult) => void;
  onBack: () => void;
}

function ServerBrowsePanel({ onSelect, onBack }: ServerBrowsePanelProps) {
  const { query, setQuery, results, loading, error } = useServerTenantSearch();
  const { isOnline } = useOnlineStatus();

  const showNoResults = !loading && query.length >= 2 && results.length === 0 && !error && isOnline;

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Cari Koperasi">
      <div>
        <h1 className="type-h5 text-foreground">Cari Koperasi</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Temukan koperasi yang terdaftar di server
        </p>
      </div>

      {/* Offline status */}
      {!isOnline && (
        <div
          className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <WifiOff size={16} className="text-yellow-600 shrink-0" />
          <p className="type-body2 text-yellow-700">
            Kamu sedang offline. Pencarian membutuhkan koneksi internet.
          </p>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          placeholder={isOnline ? "Cari koperasi..." : "Offline — tidak bisa mencari"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!isOnline}
          className="h-11 pl-9"
        />
      </div>

      {/* Loading indicator */}
      {loading && isOnline && <LoadingState variant="section" text="Mencari..." />}

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
              onClick={() => onSelect(tenant)}
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
