import type { FormEvent, RefObject } from "react";
import { Layers, Plus, Search, Settings } from "lucide-react";
import type { TenantSearchResult } from "../../../hooks/useServerTenantSearch";
import { AuthLayout } from "../../layout/AuthLayout";
import { LoadingState } from "../LoadingState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { PasswordInput } from "../../ui/password-input";

interface LoginFormPanelProps {
  username: string;
  password: string;
  tenantSlug: string;
  error: string | null;
  loading: boolean;
  selectedServerTenant: TenantSearchResult | null;
  appName: string;
  byline: string;
  passwordRef: RefObject<HTMLInputElement | null>;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTenantSlugChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onOpenServerBrowse: () => void;
  onStartSetup: () => void;
  onStartDeviceSetup: () => void;
  onViewRegisteredTenants: () => void;
}

export function LoginFormPanel({
  username,
  password,
  tenantSlug,
  error,
  loading,
  selectedServerTenant,
  appName,
  byline,
  passwordRef,
  onUsernameChange,
  onPasswordChange,
  onTenantSlugChange,
  onSubmit,
  onOpenServerBrowse,
  onStartSetup,
  onStartDeviceSetup,
  onViewRegisteredTenants,
}: LoginFormPanelProps) {
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

      <form onSubmit={onSubmit} className="space-y-4">
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
              onChange={(event) => onTenantSlugChange(event.target.value)}
              className="h-11 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={onOpenServerBrowse}
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
            placeholder="Masukkan username"
            onChange={(event) => onUsernameChange(event.target.value)}
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
            placeholder="masukkan password"
            onChange={(event) => onPasswordChange(event.target.value)}
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
        <Button type="button" onClick={onStartSetup} variant="outline" className="w-full">
          <Plus size={15} />
          Daftarkan koperasi baru
        </Button>

        <Button
          type="button"
          onClick={onStartDeviceSetup}
          variant="outline"
          className="w-full text-muted-foreground gap-2"
        >
          <Settings size={15} />
          Pasang Perangkat
        </Button>
      </div>

      <p className="type-body2 text-signal-text-disable text-center">
        {appName} · {byline}
      </p>

      <button
        type="button"
        onClick={onViewRegisteredTenants}
        className="w-full text-center type-body2 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
      >
        <Layers size={13} />
        Lihat tenant terdaftar
      </button>
    </AuthLayout>
  );
}
