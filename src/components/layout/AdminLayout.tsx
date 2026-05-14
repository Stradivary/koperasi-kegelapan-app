import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  LayoutDashboard,
  CreditCard,
  FileText,
  RefreshCw,
  Settings,
  Upload,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react'
import { BRAND } from '../../lib/brand'
import { tenantContextStore } from '../../lib/indexeddb'
import { Button } from '../ui/button'

type AdminSection = 'dashboard' | 'cards' | 'transactions' | 'reconcile' | 'settings' | 'export'

interface AdminLayoutProps {
  tenantName: string
  tenantId: string
  role: string
  activeSection: AdminSection
  onSectionChange: (section: AdminSection) => void
  children: React.ReactNode
}

const NAV_ITEMS: { id: AdminSection; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'cards', icon: CreditCard, label: 'Kartu' },
  { id: 'transactions', icon: FileText, label: 'Transaksi' },
  { id: 'reconcile', icon: RefreshCw, label: 'Rekonsiliasi' },
]

const BOTTOM_NAV_ITEMS: { id: AdminSection; icon: React.ElementType; label: string }[] = [
  { id: 'settings', icon: Settings, label: 'Pengaturan' },
  { id: 'export', icon: Upload, label: 'Export' },
]

const MOBILE_NAV: { id: AdminSection; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'cards', icon: CreditCard, label: 'Kartu' },
  { id: 'transactions', icon: FileText, label: 'Transaksi' },
  { id: 'settings', icon: Settings, label: 'Pengaturan' },
]

export function AdminLayout({
  tenantName,
  tenantId,
  role,
  activeSection,
  onSectionChange,
  children,
}: AdminLayoutProps) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await tenantContextStore.delete(tenantId)
    navigate({ to: '/' })
  }

  return (
    <div className="min-h-screen flex bg-signal-disable">
      {/* ── Desktop Sidebar ── */}
      <aside
        className={[
          'hidden lg:flex flex-col bg-brand-dark text-white flex-shrink-0 transition-all duration-200',
          collapsed ? 'w-16' : 'w-60',
        ].join(' ')}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="type-h6 text-white leading-tight truncate">{BRAND.APP_NAME}</p>
              <p className="type-body2 text-white/50 truncate">{BRAND.BYLINE}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-auto"
          >
            <ChevronLeft
              size={16}
              className={['transition-transform', collapsed ? 'rotate-180' : ''].join(' ')}
            />
          </button>
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
              onClick={() => onSectionChange(id)}
            />
          ))}
        </nav>

        {/* Bottom items */}
        <div className="px-2 pb-2 border-t border-white/10 pt-2 space-y-0.5">
          {BOTTOM_NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <SidebarItem
              key={id}
              icon={Icon}
              label={label}
              active={activeSection === id}
              collapsed={collapsed}
              onClick={() => onSectionChange(id)}
            />
          ))}
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
      <aside className="hidden md:flex lg:hidden flex-col bg-brand-dark text-white w-16 flex-shrink-0">
        <div className="flex items-center justify-center py-4 border-b border-white/10">
          <span className="type-h6 text-white">KK</span>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <SidebarItem
              key={id}
              icon={Icon}
              label={label}
              active={activeSection === id}
              collapsed
              onClick={() => onSectionChange(id)}
              tooltip={label}
            />
          ))}
        </nav>
        <div className="px-2 pb-2 border-t border-white/10 pt-2 space-y-0.5">
          {BOTTOM_NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <SidebarItem
              key={id}
              icon={Icon}
              label={label}
              active={activeSection === id}
              collapsed
              onClick={() => onSectionChange(id)}
              tooltip={label}
            />
          ))}
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile hamburger + desktop breadcrumb) */}
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="type-title-bold text-foreground truncate">{tenantName}</p>
            <p className="type-body2 text-signal-text-secondary capitalize">{activeSection}</p>
          </div>
          <button
            onClick={handleLogout}
            className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut size={16} />
            <span>Keluar</span>
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden bg-white border-t flex items-stretch">
          {MOBILE_NAV.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => onSectionChange(id)}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors',
                activeSection === id
                  ? 'text-brand font-semibold'
                  : 'text-muted-foreground',
              ].join(' ')}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ── Mobile slide-in drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex flex-col bg-brand-dark text-white w-72 h-full">
            <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
              <div>
                <p className="type-h6 text-white">{BRAND.APP_NAME}</p>
                <p className="type-body2 text-white/50">{BRAND.BYLINE}</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-white/10">
              <p className="type-body2 text-white/50">Tenant</p>
              <p className="type-body1-bold text-white">{tenantName}</p>
            </div>
            <nav className="flex-1 px-2 py-3 space-y-0.5">
              {[...NAV_ITEMS, ...BOTTOM_NAV_ITEMS].map(({ id, icon: Icon, label }) => (
                <SidebarItem
                  key={id}
                  icon={Icon}
                  label={label}
                  active={activeSection === id}
                  collapsed={false}
                  onClick={() => { onSectionChange(id); setMobileOpen(false) }}
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
  )
}

interface SidebarItemProps {
  icon: React.ElementType
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
  danger?: boolean
  tooltip?: string
}

function SidebarItem({ icon: Icon, label, active, collapsed, onClick, danger, tooltip }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
        active
          ? 'bg-brand text-white'
          : danger
            ? 'text-white/60 hover:bg-red-600/20 hover:text-red-300'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="type-body1 truncate">{label}</span>}
    </button>
  )
}
