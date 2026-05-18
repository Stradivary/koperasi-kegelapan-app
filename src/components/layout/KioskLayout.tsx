import { useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Monitor, MonitorSmartphone, ShoppingCart, Search, DoorOpen, Check, LogOut } from "lucide-react";
import { BRAND } from "../../lib/brand";
import { tenantContextStore } from "../../lib/indexeddb";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";

interface KioskLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  tenantName: string;
  tenantId: string;
  currentMode: "terminal" | "kiosk" | "scout" | "gate" | "station";
  trailing?: React.ReactNode;
  /** @deprecated Use mode switching instead. Kept for backward compat. */
  onLogoLongPress?: () => void;
}

const HOLD_MS = 500;

const MODE_OPTIONS = [
  {
    key: "terminal",
    label: "Terminal",
    icon: Monitor,
    description: "Checkout parkir & hitung durasi",
  },
  { key: "scout", label: "Scout", icon: Search, description: "Cek saldo & riwayat kartu" },
  { key: "gate", label: "Gate", icon: DoorOpen, description: "Gerbang masuk & check-in" },
  { key: "admin", label: "Station", icon: MonitorSmartphone, description: "Kelola kartu & anggota" },
] as const;

export function KioskLayout({
  children,
  title,
  subtitle,
  tenantName,
  tenantId,
  currentMode,
  trailing,
}: KioskLayoutProps) {
  const navigate = useNavigate();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);

  function startHold() {
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      setShowModePicker(true);
    }, HOLD_MS);
  }

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHolding(false);
  }

  const handleSwitchMode = useCallback(
    async (mode: "terminal" | "kiosk" | "scout" | "gate" | "admin") => {
      const ctx = await tenantContextStore.get(tenantId);
      if (ctx) {
        await tenantContextStore.put({ ...ctx, role: mode, updatedAt: Date.now() });
      }
      setShowModePicker(false);
      navigate({ to: `/tenant/${tenantId}/${mode}` });
    },
    [tenantId, navigate],
  );

  const handleLogout = useCallback(async () => {
    await tenantContextStore.delete(tenantId);
    setShowModePicker(false);
    navigate({ to: "/" });
  }, [tenantId, navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-signal-disable">
      <header
        className="bg-brand text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
      >
        <div
          className={`min-w-0 select-none touch-none${holding ? " animate-pulse opacity-60" : ""}`}
        >
          <p className="type-h6 text-white leading-tight">{tenantName}</p>
          <p className="type-body2 text-white/60">{BRAND.BYLINE}</p>
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
        <div className="text-right min-w-0 select-none">
          <p className="type-body2 text-white/60 truncate">{BRAND.APP_NAME}</p>
          <p className="type-body1-bold text-white">{title}</p>
          {subtitle && <p className="type-body2 text-white/70">{subtitle}</p>}
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>

      {/* Mode Picker Dialog */}
      <Dialog open={showModePicker} onOpenChange={setShowModePicker}>
        <DialogContent showCloseButton={false} className="max-w-sm p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="type-h5">Ganti Mode</DialogTitle>
            <DialogDescription className="type-body2 text-muted-foreground">
              Pilih peran untuk perangkat ini
            </DialogDescription>
          </DialogHeader>

          <div className="px-3 pb-3 space-y-1">
            {MODE_OPTIONS.map(({ key, label, icon: Icon, description }) => {
              const isActive = key === currentMode;
              return (
                <button
                  key={key}
                  onClick={() => handleSwitchMode(key)}
                  disabled={isActive}
                  className={[
                    "w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all",
                    isActive
                      ? "bg-brand/10 border-2 border-brand cursor-default"
                      : "border-2 border-transparent hover:bg-accent active:scale-[0.98]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "size-10 rounded-lg flex items-center justify-center shrink-0",
                      isActive ? "bg-brand text-white" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        "type-body1-bold",
                        isActive ? "text-brand" : "text-foreground",
                      ].join(" ")}
                    >
                      {label}
                    </p>
                    <p className="type-body2 text-muted-foreground truncate">{description}</p>
                  </div>
                  {isActive && (
                    <div className="size-6 rounded-full bg-brand flex items-center justify-center shrink-0">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t px-5 py-3">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            >
              <LogOut size={16} />
              Keluar dari perangkat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
