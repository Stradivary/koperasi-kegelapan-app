import { CheckCircle } from "lucide-react";
import { useState } from "react";
import { BRAND } from "../../lib/brand";
import { AuthLayout } from "../layout/AuthLayout";
import { getDeviceFingerprint } from "../../lib/getOrCreateDeviceId";
import { tenantContextStore } from "../../lib/indexeddb";
import { setupLocalTenant } from "../../lib/localTenant";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type SetupStep = "tenant" | "admin" | "done";

interface LocalSetupSectionProps {
  onComplete: (tenantId: string, role: string) => void;
  onServerMode: () => void;
}

export function LocalSetupSection({ onComplete, onServerMode }: LocalSetupSectionProps) {
  const [step, setStep] = useState<SetupStep>("tenant");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSetup() {
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
      await tenantContextStore.put({
        tenantId: cfg.tenantId,
        tenantSlug: cfg.slug,
        tenantName: cfg.name,
        deviceId: await getDeviceFingerprint(),
        accountId: cfg.tenantId + "-admin",
        role: "admin",
        terminalId: 0,
        updatedAt: Date.now(),
      });
      setStep("done");
      setTimeout(() => onComplete(cfg.tenantId, "admin"), 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Daftarkan Koperasi" align="center">
      {/* Step: Tenant info */}
      {step === "tenant" && (
        <div className="space-y-4">
          <div>
            <h1 className="type-h5 text-foreground">Informasi Koperasi</h1>
            <p className="type-body2 text-signal-text-secondary mt-0.5">Isi detail koperasi Anda</p>
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Nama Koperasi</Label>
            <Input
              placeholder="Contoh: Koperasi Maju"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Slug (opsional)</Label>
            <Input
              placeholder="koperasi-maju"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            />
            <p className="type-body2 text-muted-foreground">
              Biarkan kosong untuk generate otomatis
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onServerMode} className="flex-1">
              Kembali
            </Button>
            <Button
              onClick={() => {
                const slug = tenantSlug || tenantName.toLowerCase().replace(/\s+/g, "-");
                setAdminUsername(`${slug}-admin`);
                setStep("admin");
              }}
              disabled={!tenantName.trim()}
              className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90"
            >
              Lanjut
            </Button>
          </div>
        </div>
      )}

      {/* Step: Admin account */}
      {step === "admin" && (
        <div className="space-y-4">
          <div>
            <h1 className="type-h5 text-foreground">Akun Admin</h1>
            <p className="type-body2 text-signal-text-secondary mt-0.5">
              Buat akun admin untuk koperasi <strong>{tenantName}</strong>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Username Admin</Label>
            <Input
              placeholder="admin"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              autoComplete="username"
            />
            <p className="type-body2 text-muted-foreground">
              Disarankan:{" "}
              <code className="text-xs">
                {(tenantSlug || tenantName.toLowerCase().replace(/\s+/g, "-")) + "-admin"}
              </code>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Password</Label>
            <Input
              type="password"
              placeholder="Min. 6 karakter"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Konfirmasi Password</Label>
            <Input
              type="password"
              placeholder="Ulangi password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
              <p className="type-body2 text-signal-error">{error}</p>
            </div>
          )}
          <p className="type-body2 text-signal-text-secondary bg-signal-bg-info rounded-lg p-3 border border-signal-info/20">
            Password admin akan digunakan untuk mengenkripsi backup data. Simpan dengan aman.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("tenant")} className="flex-1">
              Kembali
            </Button>
            <Button
              onClick={handleSetup}
              disabled={loading || !adminUsername.trim() || !adminPassword}
              className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90"
            >
              {loading ? "Menyiapkan..." : "Selesaikan"}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="text-center space-y-3 py-4">
          <div className="w-16 h-16 rounded-full bg-signal-bg-valid flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-signal-valid" />
          </div>
          <p className="type-title-bold text-foreground">Siap!</p>
          <p className="type-body1 text-signal-text-secondary">
            {BRAND.APP_NAME} siap digunakan secara lokal.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
