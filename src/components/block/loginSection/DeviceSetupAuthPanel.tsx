import { AuthLayout } from "../../layout/AuthLayout";
import { LoadingState } from "../LoadingState";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { PasswordInput } from "../../ui/password-input";

interface DeviceSetupAuthPanelProps {
  username: string;
  password: string;
  error: string | null;
  loading: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  cancelLabel?: string;
}

export function DeviceSetupAuthPanel({
  username,
  password,
  error,
  loading,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  onCancel,
  cancelLabel = "Batal",
}: DeviceSetupAuthPanelProps) {
  return (
    <AuthLayout variant="brand-dark">
      <div>
        <h1 className="type-h5 text-foreground">Pasang Perangkat</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Login sebagai admin untuk mengkonfigurasi perangkat ini
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="setup-username" className="type-body1-bold">
            Username Admin
          </Label>
          <Input
            id="setup-username"
            type="text"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            placeholder="Masukkan username"
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
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            required
            placeholder="masukkan password"
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

      <Button type="button" variant="outline" onClick={onCancel} className="w-full">
        {cancelLabel}
      </Button>
    </AuthLayout>
  );
}
