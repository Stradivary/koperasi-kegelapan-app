import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Server,
  HardDrive,
  DoorOpen,
  MonitorSmartphone,
  BookOpen,
  Settings,
  Layers,
} from "lucide-react";
import { tenantContextStore } from "../../lib/indexeddb";
import { localLogin, hasLocalTenant } from "../../lib/localTenant";
import { getOrCreateDeviceId } from "../../lib/getOrCreateDeviceId";
import { BRAND } from "../../lib/brand";
import { AuthLayout } from "../layout/AuthLayout";
import { LocalSetupSection } from "./LocalSetupSection";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";
import { LoadingState } from "../block/LoadingState";

type LoginMode = "detecting" | "server" | "local" | "setup" | "device-setup";
type DeviceSetupStep = "auth" | "pick-role";

const NO_AUTH_ROLES = ["gate", "terminal", "scout"] as const;

export function LoginSection() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>("detecting");
  const [hasLocal, setHasLocal] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

  useEffect(() => {
    async function detectMode() {
      // Auto-boot: if this device is already registered as a no-auth role, go directly
      const contexts = await tenantContextStore.getAll();
      const noAuthCtx = contexts.find((c) => (NO_AUTH_ROLES as readonly string[]).includes(c.role));
      if (noAuthCtx) {
        redirectToRole(noAuthCtx.tenantId, noAuthCtx.role);
        return;
      }

      const exists = await hasLocalTenant();
      setHasLocal(exists);
      setMode(exists ? "local" : "server");
    }
    detectMode();
  }, []);

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

  function switchMode(next: "server" | "local") {
    setError(null);
    setUsername("");
    setPassword("");
    if (next === "local" && !hasLocal) {
      setMode("setup");
    } else {
      setMode(next);
    }
  }

  function enterDeviceSetup() {
    setError(null);
    setUsername("");
    setPassword("");
    setSetupStep("auth");
    setPendingContext(null);
    setMode("device-setup");
  }

  async function handleLocalLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await localLogin(username, password);
      if (!result) {
        setError("Username atau password salah");
        return;
      }
      await tenantContextStore.put({
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: result.tenantName,
        deviceId: getOrCreateDeviceId(),
        accountId: result.accountId,
        role: result.role,
        terminalId: 0,
        updatedAt: Date.now(),
      });
      redirectToRole(result.tenantId, result.role);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleServerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Username atau password salah");
        return;
      }
      const data = await res.json();
      await tenantContextStore.put({
        tenantId: data.tenantId,
        tenantSlug: data.tenantSlug,
        tenantName: data.tenantName,
        deviceId: getOrCreateDeviceId(),
        accountId: data.accountId,
        role: data.role,
        terminalId: 0,
        updatedAt: Date.now(),
      });
      redirectToRole(data.tenantId, data.role);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeviceSetupAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await localLogin(username, password);
      if (!result) {
        setError("Username atau password salah");
        return;
      }
      if (!["admin", "station"].includes(result.role)) {
        setError("Diperlukan akun admin untuk mengkonfigurasi perangkat");
        return;
      }
      setPendingContext({
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        tenantName: result.tenantName,
        accountId: result.accountId,
      });
      setSetupStep("pick-role");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePickDeviceRole(role: "gate" | "terminal" | "scout") {
    if (!pendingContext) return;
    await tenantContextStore.put({
      ...pendingContext,
      deviceId: getOrCreateDeviceId(),
      role,
      terminalId: 0,
      updatedAt: Date.now(),
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
          setHasLocal(true);
          redirectToRole(tenantId, role);
        }}
        onServerMode={() => switchMode("server")}
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

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handlePickDeviceRole("gate")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-white hover:border-brand hover:bg-brand/5 transition-all text-left"
            >
              <div className="size-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <DoorOpen size={22} className="text-brand" />
              </div>
              <div>
                <p className="type-title-bold text-foreground">Gerbang (Gate)</p>
                <p className="type-body2 text-muted-foreground">
                  Mencatat waktu masuk ke kartu anggota
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePickDeviceRole("terminal")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-white hover:border-brand hover:bg-brand/5 transition-all text-left"
            >
              <div className="size-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <MonitorSmartphone size={22} className="text-brand" />
              </div>
              <div>
                <p className="type-title-bold text-foreground">Terminal (Exit)</p>
                <p className="type-body2 text-muted-foreground">
                  Menghitung durasi dan memotong saldo anggota
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePickDeviceRole("scout")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-transparent bg-white hover:border-brand hover:bg-brand/5 transition-all text-left"
            >
              <div className="size-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <BookOpen size={22} className="text-brand" />
              </div>
              <div>
                <p className="type-title-bold text-foreground">Buku Saku (Scout)</p>
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
            <Input
              id="setup-password"
              type="password"
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
            {loading ? (
              <>
                <Spinner size="sm" className="text-white" /> Memuat...
              </>
            ) : (
              "Lanjut"
            )}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          onClick={() => setMode(hasLocal ? "local" : "server")}
          className="w-full"
        >
          Batal
        </Button>
      </AuthLayout>
    );
  }

  const isLocal = mode === "local";
  const handleSubmit = isLocal ? handleLocalLogin : handleServerLogin;

  return (
    <AuthLayout variant={isLocal ? "brand-dark" : "brand"}>
      {/* Mode toggle */}
      <div className="flex rounded-xl border bg-muted/40 p-1 gap-1">
        <button
          type="button"
          onClick={() => switchMode("server")}
          className={[
            "flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
            !isLocal
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Server size={15} />
          Server
        </button>
        <button
          type="button"
          onClick={() => switchMode("local")}
          className={[
            "flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
            isLocal
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <HardDrive size={15} />
          Lokal
        </button>
      </div>

      <div>
        <h1 className="type-h5 text-foreground">Masuk</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          {isLocal ? "Masuk menggunakan akun lokal" : "Masuk ke terminal Anda"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <Input
            id="password"
            type="password"
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
          className={[
            "w-full h-12 text-white type-title-bold",
            isLocal ? "bg-brand-dark hover:bg-brand-dark/90" : "bg-brand hover:bg-brand/90",
          ].join(" ")}
        >
          {loading ? (
            <>
              <Spinner size="sm" className="text-white" /> Memuat...
            </>
          ) : (
            "Masuk"
          )}
        </Button>
      </form>

      <div className="pt-1 border-t space-y-2">
        {isLocal && (
          <Button
            type="button"
            onClick={() => {
              setMode("setup");
              setError(null);
            }}
            variant="outline"
            className="w-full"
          >
            Daftarkan koperasi baru
          </Button>
        )}
        {isLocal && hasLocal && (
          <Button
            type="button"
            onClick={enterDeviceSetup}
            variant="ghost"
            className="w-full text-muted-foreground gap-2"
          >
            <Settings size={15} />
            Pasang Perangkat
          </Button>
        )}
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
