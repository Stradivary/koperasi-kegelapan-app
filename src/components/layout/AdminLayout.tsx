import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  CreditCard,
  Leaf,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { BRAND } from "../../lib/brand";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { tenantContextStore } from "../../lib/indexeddb";
import { Button } from "../ui/button";
import type { SyncEngineStatus } from "../../hooks/useSyncEngine";
import { SyncStatusIndicator } from "../block/SyncStatusIndicator";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "../ui/drawer";
import { MobileBottomNav, type MobileNavItem } from "./MobileBottomNav";

export type AdminView = "cards" | "members" | "scout" | "transactions" | "settings";

interface AdminLayoutProps {
  tenantName: string;
  tenantId: string;
  role: string;
  activeSection: AdminView;
  onSectionChange: (section: AdminView) => void;
  children: React.ReactNode;
  /** Sync engine status for the status indicator */
  syncStatus?: SyncEngineStatus;
  /** Timestamp of last successful sync (epoch ms) */
  lastSyncedAt?: number | null;
  /** Number of pending Outbox entries */
  pendingCount?: number;
  /** Callback to trigger manual sync */
  onTriggerSync?: () => void;
  /** Callback to sync tenant to server (shown when tenant is local-only) */
  onSyncToServer?: () => void;
  /** Whether the tenant-to-server sync is in progress */
  isSyncingToServer?: boolean;
}

const NAV_ITEMS: { id: AdminView; icon: React.ElementType; label: string }[] = [
  { id: "cards", icon: CreditCard, label: "Kartu" },
  { id: "members", icon: UserCheck, label: "Anggota" },
  { id: "transactions", icon: Receipt, label: "Transaksi" },
  { id: "scout", icon: BookOpen, label: "Scout" },
  { id: "settings", icon: Settings, label: "Pengaturan" },
];

const MOBILE_NAV: MobileNavItem<AdminView>[] = [
  { id: "cards", icon: CreditCard, label: "Kartu" },
  { id: "members", icon: UserCheck, label: "Anggota" },
  { id: "scout", icon: BookOpen, label: "Scout", cta: true },
  { id: "transactions", icon: Receipt, label: "Transaksi" },
  { id: "settings", icon: Settings, label: "Pengaturan" },
];

const SECTION_LABEL: Record<AdminView, string> = {
  cards: "Kartu",
  members: "Anggota",
  transactions: "Transaksi",
  scout: "Scout",
  settings: "Pengaturan",
};

export function AdminLayout({
  tenantName,
  tenantId,
  role,
  activeSection,
  onSectionChange,
  children,
  syncStatus,
  lastSyncedAt,
  pendingCount,
  onTriggerSync,
  onSyncToServer,
  isSyncingToServer,
}: AdminLayoutProps) {
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);

  async function handleLogout() {
    await tenantContextStore.delete(tenantId);
    navigate({ to: "/" });
  }

  function handleNavClick(id: AdminView) {
    if (id === "scout") {
      navigate({ to: `/tenant/${tenantId}/scout` });
    } else if (id === "transactions") {
      navigate({ to: `/tenant/${tenantId}/transactions` });
    } else if (id === "cards") {
      navigate({ to: `/tenant/${tenantId}/cards` });
    } else if (id === "members") {
      navigate({ to: `/tenant/${tenantId}/members` });
    } else if (id === "settings") {
      navigate({ to: `/tenant/${tenantId}/settings` });
    } else {
      onSectionChange(id);
    }
  }

  return (
    <div className="relative h-screen flex bg-signal-disable overflow-hidden">
      {/* ── Desktop Sidebar ── */}
      <aside
        className={[
          "hidden lg:flex flex-col bg-brand-dark text-white shrink-0 transition-all duration-200",
          collapsed ? "w-16" : "w-60",
        ].join(" ")}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          {!collapsed && (
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
                <Leaf size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="type-h6 text-white leading-tight truncate">{BRAND.APP_NAME}</p>
                <p className="type-body2 text-white/50 truncate">Admin Panel</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft
              size={16}
              className={["transition-transform", collapsed ? "rotate-180" : ""].join(" ")}
            />
          </Button>
        </div>

        {/* Tenant chip */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-white/10">
            <p className="type-body2 text-white/50 mb-0.5">Tenant</p>
            <p className="type-body1-bold text-white truncate">{tenantName}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/10 type-body2 text-white/70 uppercase tracking-wide">
              {role}
            </span>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <SidebarItem
              key={id}
              icon={Icon}
              label={label}
              active={activeSection === id}
              collapsed={collapsed}
              onClick={() => handleNavClick(id)}
            />
          ))}
        </nav>

        {/* Bottom items */}
        <div className="px-2 pb-3 border-t border-white/10 pt-2">
          <SidebarItem
            icon={LogOut}
            label="Keluar"
            active={false}
            collapsed={collapsed}
            onClick={handleLogout}
            danger
          />
        </div>
      </aside>

      {/* ── Tablet Sidebar (icon-only, hover expands via CSS) ── */}
      <aside className="hidden md:flex lg:hidden flex-col bg-brand-dark text-white w-16 shrink-0">
        <div className="flex items-center justify-center py-4 border-b border-white/10">
          <div className="size-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <Leaf size={16} className="text-white" />
          </div>
        </div>
        {/* Connectivity status */}
        <div className="flex justify-center py-2 border-b border-white/10">
          <ConnectivityBadge isOnline={isOnline} collapsed />
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <SidebarItem
              key={id}
              icon={Icon}
              label={label}
              active={activeSection === id}
              collapsed
              onClick={() => handleNavClick(id)}
              tooltip={label}
            />
          ))}
        </nav>
        <div className="px-2 pb-3 border-t border-white/10 pt-2">
          <SidebarItem
            icon={LogOut}
            label="Keluar"
            active={false}
            collapsed
            onClick={handleLogout}
            danger
            tooltip="Keluar"
          />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar (mobile hamburger + desktop breadcrumb) */}
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
            className="md:hidden"
          >
            <Menu size={20} />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="type-title-bold text-foreground truncate">
              {SECTION_LABEL[activeSection]}
            </p>
            <p className="type-body2 text-muted-foreground truncate">{tenantName}</p>
          </div>
          {/* Compact sync status dot — opens drawer on click */}
          <button
            type="button"
            onClick={() => setSyncDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Lihat status sinkronisasi"
          >
            <span
              className={[
                "size-2.5 rounded-full shrink-0",
                !isOnline
                  ? "bg-red-500"
                  : syncStatus === "error"
                    ? "bg-red-500"
                    : syncStatus === "pushing" || syncStatus === "pulling"
                      ? "bg-blue-500 animate-pulse"
                      : (pendingCount ?? 0) > 0
                        ? "bg-amber-500"
                        : "bg-green-500",
              ].join(" ")}
              aria-hidden="true"
            />
            {(pendingCount ?? 0) > 0 && (
              <span className="text-xs text-amber-700 font-medium">{pendingCount}</span>
            )}
          </button>
        </header>

        {/* Sync status drawer */}
        <Drawer open={syncDrawerOpen} onOpenChange={setSyncDrawerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Status Sinkronisasi</DrawerTitle>
              <DrawerDescription>Koneksi dan status sync tenant</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6 space-y-4">
              {/* Online status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Koneksi</span>
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "size-2.5 rounded-full",
                      isOnline ? "bg-green-500" : "bg-red-500",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span
                    className={[
                      "text-sm font-medium",
                      isOnline ? "text-green-600" : "text-red-600",
                    ].join(" ")}
                  >
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>
              </div>

              {/* Sync engine status */}
              {syncStatus && isOnline && (
                <div className="space-y-3">
                  <SyncStatusIndicator
                    syncStatus={syncStatus}
                    lastSyncedAt={lastSyncedAt ?? null}
                    pendingCount={pendingCount ?? 0}
                    onSync={onTriggerSync}
                  />
                </div>
              )}

              {/* Sync to Server button — shown when tenant is local-only and online */}
              {onSyncToServer && isOnline && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onSyncToServer();
                    setSyncDrawerOpen(false);
                  }}
                  disabled={isSyncingToServer}
                  className="w-full gap-1.5"
                >
                  <Upload size={14} />
                  {isSyncingToServer ? "Syncing..." : "Sync ke Server"}
                </Button>
              )}
            </div>
          </DrawerContent>
        </Drawer>

        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">{children}</main>

        {/* Mobile bottom nav */}
        <MobileBottomNav items={MOBILE_NAV} activeId={activeSection} onSelect={handleNavClick} />
      </div>

      {/* ── Mobile slide-in drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col bg-brand-dark text-white w-72 h-full">
            <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
              <div>
                <p className="type-h6 text-white">{BRAND.APP_NAME}</p>
                <p className="type-body2 text-white/50">{BRAND.BYLINE}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileOpen(false)}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </Button>
            </div>
            <div className="px-4 py-3 border-b border-white/10">
              <p className="type-body2 text-white/50">Tenant</p>
              <p className="type-body1-bold text-white">{tenantName}</p>
            </div>
            {/* Connectivity status */}
            <div className="px-4 py-2 border-b border-white/10">
              <ConnectivityBadge isOnline={isOnline} collapsed={false} />
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5">
              {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
                <SidebarItem
                  key={id}
                  icon={Icon}
                  label={label}
                  active={activeSection === id}
                  collapsed={false}
                  onClick={() => {
                    handleNavClick(id);
                    setMobileOpen(false);
                  }}
                />
              ))}
            </nav>
            <div className="px-2 pb-4 border-t border-white/10 pt-2">
              <SidebarItem
                icon={LogOut}
                label="Keluar"
                active={false}
                collapsed={false}
                onClick={handleLogout}
                danger
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  danger?: boolean;
  tooltip?: string;
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
  danger,
  tooltip,
}: SidebarItemProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      title={tooltip}
      className={[
        "w-full h-auto justify-start px-3 py-2.5 rounded-lg",
        active
          ? "bg-brand text-white hover:bg-brand/90 hover:text-white"
          : danger
            ? "text-white/60 hover:bg-red-600/20 hover:text-red-300"
            : "text-white/70 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="type-body1 truncate">{label}</span>}
    </Button>
  );
}

interface ConnectivityBadgeProps {
  isOnline: boolean;
  collapsed: boolean;
}

function ConnectivityBadge({ isOnline, collapsed }: ConnectivityBadgeProps) {
  const label = isOnline ? "Online" : "Offline";
  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-label={`Connectivity status: ${label}`}
    >
      <span
        className={[
          "size-2.5 rounded-full shrink-0",
          isOnline ? "bg-green-400" : "bg-red-400",
        ].join(" ")}
        aria-hidden="true"
      />
      {!collapsed && (
        <span className={["type-body2", isOnline ? "text-green-300" : "text-red-300"].join(" ")}>
          {label}
        </span>
      )}
    </div>
  );
}
