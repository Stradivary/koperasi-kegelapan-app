import { BookOpen, DoorOpen, MonitorSmartphone } from "lucide-react";
import { AuthLayout } from "../../layout/AuthLayout";
import { Button } from "../../ui/button";

interface DeviceRoleSelectionPanelProps {
  onSelectRole: (role: "gate" | "terminal" | "scout") => void;
  onBack: () => void;
}

export function DeviceRoleSelectionPanel({ onSelectRole, onBack }: DeviceRoleSelectionPanelProps) {
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
          onClick={() => onSelectRole("gate")}
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
          onClick={() => onSelectRole("terminal")}
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
          onClick={() => onSelectRole("scout")}
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

      <Button type="button" variant="outline" onClick={onBack} className="w-full">
        Kembali
      </Button>
    </AuthLayout>
  );
}
