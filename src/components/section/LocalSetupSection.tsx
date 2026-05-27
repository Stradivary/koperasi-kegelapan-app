import successHumanImg from "#/assets/images/success_human.svg";
import { BRAND } from "#/lib/brand";
import { useLocalSetup } from "#/hooks/useLocalSetup";
import { createSlug } from "#/lib/slugValidation";
import { AuthLayout } from "../layout/AuthLayout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface LocalSetupSectionProps {
  onComplete: (tenantId: string, role: string) => void;
  onBack: () => void;
}

export function LocalSetupSection({ onComplete, onBack }: LocalSetupSectionProps) {
  const setup = useLocalSetup({ onComplete });

  return (
    <AuthLayout variant="brand-dark" headerSubtitle="Daftarkan Koperasi" align="center">
      {/* Step: Tenant info */}
      {setup.step === "tenant" && (
        <div className="space-y-4">
          <div>
            <h1 className="type-h5 text-foreground">Informasi Koperasi</h1>
            <p className="type-body2 text-signal-text-secondary mt-0.5">Isi detail koperasi Anda</p>
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Nama Koperasi</Label>
            <Input
              placeholder="Contoh: Koperasi Maju"
              value={setup.tenantName}
              onChange={(e) => setup.setTenantName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Slug (opsional)</Label>
            <Input
              placeholder="koperasi-maju"
              value={setup.tenantSlug}
              onChange={(e) =>
                setup.setTenantSlug(e.target.value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""))
              }
            />
            {setup.slugError ? (
              <p className="type-body2 text-signal-error">{setup.slugError}</p>
            ) : (
              <p className="type-body2 text-muted-foreground">
                Biarkan kosong untuk generate otomatis
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} className="flex-1">
              Kembali
            </Button>
            <Button
              onClick={setup.handleNextStep}
              disabled={!setup.tenantName.trim() || !!setup.slugError}
              className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90"
            >
              Lanjut
            </Button>
          </div>
        </div>
      )}

      {/* Step: Admin account */}
      {setup.step === "admin" && (
        <div className="space-y-4">
          <div>
            <h1 className="type-h5 text-foreground">Akun Admin</h1>
            <p className="type-body2 text-signal-text-secondary mt-0.5">
              Buat akun admin untuk koperasi <strong>{setup.tenantName}</strong>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Username Admin</Label>
            <Input
              placeholder="admin"
              value={setup.adminUsername}
              onChange={(e) => setup.setAdminUsername(e.target.value)}
              autoComplete="username"
            />
            <p className="type-body2 text-muted-foreground">
              Disarankan:{" "}
              <code className="text-xs">
                {(setup.tenantSlug || createSlug(setup.tenantName)) + "-admin"}
              </code>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Password</Label>
            <Input
              type="password"
              placeholder="Min. 6 karakter"
              value={setup.adminPassword}
              onChange={(e) => setup.setAdminPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-body1-bold">Konfirmasi Password</Label>
            <Input
              type="password"
              placeholder="Ulangi password"
              value={setup.confirmPassword}
              onChange={(e) => setup.setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {setup.error && (
            <div className="rounded-lg bg-signal-bg-error border border-signal-error/30 px-3 py-2">
              <p className="type-body2 text-signal-error">{setup.error}</p>
            </div>
          )}
          <p className="type-body2 text-signal-text-secondary bg-signal-bg-info rounded-lg p-3 border border-signal-info/20">
            Password admin akan digunakan untuk mengenkripsi backup data. Simpan dengan aman.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setup.setStep("tenant")} className="flex-1">
              Kembali
            </Button>
            <Button
              onClick={setup.handleSetup}
              disabled={setup.loading || !setup.adminUsername.trim() || !setup.adminPassword}
              className="flex-1 bg-brand-dark text-white hover:bg-brand-dark/90"
            >
              {setup.loading ? "Menyiapkan..." : "Selesaikan"}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {setup.step === "done" && (
        <div className="text-center space-y-3 py-4">
          <img
            src={successHumanImg}
            alt="Setup selesai"
            className="w-40 h-40 object-contain mx-auto drop-shadow-md"
          />
          <p className="type-title-bold text-foreground">Siap!</p>
          <p className="type-body1 text-signal-text-secondary">
            {BRAND.APP_NAME} siap digunakan secara lokal.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
