import { useRef, useState } from "react";
import { BRAND } from "../../lib/brand";

interface KioskLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  tenantName: string;
  trailing?: React.ReactNode;
  onLogoLongPress?: () => void;
}

const HOLD_MS = 3000;

export function KioskLayout({
  children,
  title,
  subtitle,
  tenantName,
  trailing,
  onLogoLongPress,
}: KioskLayoutProps) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  function startHold() {
    if (!onLogoLongPress) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      onLogoLongPress();
    }, HOLD_MS);
  }

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHolding(false);
  }

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
    </div>
  );
}
