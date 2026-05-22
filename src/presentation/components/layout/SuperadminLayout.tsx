import { useNavigate } from "@tanstack/react-router";
import { Building2, Leaf, LogOut, Menu, Users } from "lucide-react";
import { useState } from "react";
import { BRAND } from "#/presentation/lib/brand";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { MobileBottomNav, type MobileNavItem } from "./MobileBottomNav";

export type SuperadminView = "tenants" | "accounts";

export interface SuperadminLayoutProps {
  activeSection: SuperadminView;
  onSectionChange: (section: SuperadminView) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: MobileNavItem<SuperadminView>[] = [
  { id: "tenants", icon: Building2, label: "Tenants" },
  { id: "accounts", icon: Users, label: "Accounts" },
];

const SECTION_LABEL: Record<SuperadminView, string> = {
  tenants: "Tenants",
  accounts: "Accounts",
};

export function SuperadminLayout({
  activeSection,
  onSectionChange,
  children,
}: SuperadminLayoutProps) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleLogout() {
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex bg-signal-disable">
      {/* ── Desktop Sidebar (≥768px) ── */}
      <aside className="hidden md:flex flex-col bg-brand-dark text-white w-60 shrink-0">
        {/* Sidebar header */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
          <div className="size-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <Leaf size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="type-h6 text-white leading-tight truncate">{BRAND.APP_NAME}</p>
            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-white/10 type-body2 text-white/70 uppercase tracking-wide">
              Superadmin
            </span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <SidebarItem
              key={id}
              icon={Icon}
              label={label}
              active={activeSection === id}
              onClick={() => onSectionChange(id)}
            />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-2 pb-3 border-t border-white/10 pt-2">
          <SidebarItem icon={LogOut} label="Logout" active={false} onClick={handleLogout} danger />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar (mobile only) */}
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setDrawerOpen(true)}>
            <Menu size={20} />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="type-title-bold text-foreground truncate">
              {SECTION_LABEL[activeSection]}
            </p>
            <p className="type-body2 text-muted-foreground truncate">Superadmin</p>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">{children}</main>

        {/* Mobile bottom nav (below 768px) */}
        <MobileBottomNav items={NAV_ITEMS} activeId={activeSection} onSelect={onSectionChange} />
      </div>

      {/* ── Mobile slide-in drawer (Sheet) ── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="bg-brand-dark text-white border-none p-0 w-72"
          showCloseButton={false}
        >
          <SheetHeader className="px-4 py-5 border-b border-white/10">
            <SheetTitle className="flex items-center gap-2.5 text-white">
              <div className="size-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
                <Leaf size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="type-h6 text-white leading-tight truncate">{BRAND.APP_NAME}</p>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-white/10 type-body2 text-white/70 uppercase tracking-wide">
                  Superadmin
                </span>
              </div>
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
              <SidebarItem
                key={id}
                icon={Icon}
                label={label}
                active={activeSection === id}
                onClick={() => {
                  onSectionChange(id);
                  setDrawerOpen(false);
                }}
              />
            ))}
          </nav>

          <div className="px-2 pb-4 border-t border-white/10 pt-2 mt-auto">
            <SidebarItem
              icon={LogOut}
              label="Logout"
              active={false}
              onClick={handleLogout}
              danger
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}

function SidebarItem({ icon: Icon, label, active, onClick, danger }: SidebarItemProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
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
      <span className="type-body1 truncate">{label}</span>
    </Button>
  );
}
