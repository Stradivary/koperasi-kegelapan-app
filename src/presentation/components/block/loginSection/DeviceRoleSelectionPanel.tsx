import { BookOpen, DoorOpen, type LucideIcon, MonitorSmartphone } from "lucide-react";
import { AuthLayout } from "../../layout/AuthLayout";
import { Button } from "../../ui/button";

interface DeviceRoleSelectionPanelProps {
  onSelectRole: (role: "gate" | "terminal" | "scout") => void;
  onBack: () => void;
  backLabel?: string;
}

type DeviceRole = "gate" | "terminal" | "scout";

interface RoleOption {
  role: DeviceRole;
  label: string;
  description: string;
  icon: LucideIcon;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: "gate",
    label: "Gerbang (Gate)",
    description: "Mencatat waktu masuk ke kartu anggota",
    icon: DoorOpen,
  },
  {
    role: "terminal",
    label: "Terminal (Exit)",
    description: "Menghitung durasi dan memotong saldo anggota",
    icon: MonitorSmartphone,
  },
  {
    role: "scout",
    label: "Buku Saku (Scout)",
    description: "Anggota melihat saldo dan riwayat kartu",
    icon: BookOpen,
  },
];

export function DeviceRoleSelectionPanel({
  onSelectRole,
  onBack,
  backLabel = "Kembali",
}: DeviceRoleSelectionPanelProps) {
  return (
    <AuthLayout variant="brand-dark">
      <div>
        <h1 className="type-h5 text-foreground">Pilih Peran Perangkat</h1>
        <p className="type-body2 text-signal-text-secondary mt-0.5">
          Perangkat ini akan selalu berjalan dalam peran yang dipilih
        </p>
      </div>

      <div className="space-y-1">
        {ROLE_OPTIONS.map(({ role, label, description, icon: Icon }) => (
          <button
            key={role}
            type="button"
            onClick={() => onSelectRole(role)}
            className="w-full flex items-center gap-3 rounded-xl px-4 py-3 border-2 border-transparent hover:bg-accent active:scale-[0.98] transition-all text-left"
          >
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon size={20} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="type-body1-bold text-foreground">{label}</p>
              <p className="type-body2 text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={onBack} className="w-full">
        {backLabel}
      </Button>
    </AuthLayout>
  );
}
