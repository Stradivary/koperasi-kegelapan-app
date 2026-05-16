import { useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Monitor, ShoppingCart, Search, DoorOpen } from "lucide-react";
import { BRAND } from "../../lib/brand";
import { tenantContextStore } from "../../lib/indexeddb";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface KioskLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  tenantName: string;
  tenantId: string;
  currentMode: "terminal" | "kiosk" | "scout" | "gate";
  trailing?: React.ReactNode;
  /** @deprecated Use mode switching instead. Kept for backward compat. */
  onLogoLongPress?: () => void;
}

const HOLD_MS = 1500;

const MODE_OPTIONS = [
  { key: "terminal", label: "Terminal", icon: Monitor, description: "Checkout parkir" },
  { key: "kiosk", label: "Kiosk", icon: ShoppingCart, description: "Mesin kasir" },
  { key: "scout", label: "Scout", icon: Search, description: "Cek saldo" },
  { key: "gate", label: "Gate", icon: DoorOpen, description: "Gerbang masuk" },
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
    async (mode: "terminal" | "kiosk" | "scout" | "gate") => {
      // Update stored role
      const ctx = await tenantContextStore.get(tenantId);
      if (ctx) {
        await tenantContextStore.put({ ...ctx, role: mode, updatedAt: Date.now() });
      }
      setShowModePicker(false);
      navigate({ to: `/tenant/${tenantId}/${mode}` });
    },
    [tenantId, navigate],
  );

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
          <p className="type-h6 text-white leading-tight">{BRAND.APP_NAME}</p>
          <p className="type-body2 text-white/60">{BRAND.BYLINE}</p>
        </div>
        <div className="text-right min-w-0 select-none">
          <p className="type-body2 text-white/60 truncate">{tenantName}</p>
          <p className="type-body1-bold text-white">{title}</p>
          {subtitle && <p className="type-body2 text-white/70">{subtitle}</p>}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </header>
      <main className="flex-1 flex flex-col">{children}</main>

      <Dialog open={showModePicker} onOpenChange={setShowModePicker}>
        <DialogContent showCloseButton={false} className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Ganti Mode</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {MODE_OPTIONS.map(({ key, label, icon: Icon, description }) => (
              <button
                key={key}
                onClick={() => handleSwitchMode(key)}
                disabled={key === currentMode}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                  key === currentMode
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border hover:border-brand/50 hover:bg-accent"
                }`}
              >
                <Icon className="size-6" />
                <span className="type-body1-bold">{label}</span>
                <span className="type-body2 text-muted-foreground text-center">{description}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
