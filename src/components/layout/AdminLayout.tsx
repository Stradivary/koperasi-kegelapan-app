import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CreditCard,
  ClipboardList,
  UserCheck,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react'
import { BRAND } from '../../lib/brand'
import { tenantContextStore } from '../../lib/indexeddb'
import { Button } from '../ui/button'

export type AdminView = 'cards' | 'audit' | 'members'

interface AdminLayoutProps {
  tenantName: string
  tenantId: string
  role: string
  activeSection: AdminView
  onSectionChange: (section: AdminView) => void
  children: React.ReactNode
}

const NAV_ITEMS: { id: AdminView; icon: React.ElementType; label: string }[] = [
  { id: 'cards', icon: CreditCard, label: 'Kartu' },
  { id: 'audit', icon: ClipboardList, label: 'Audit Log' },
  { id: 'members', icon: UserCheck, label: 'Anggota' },
]

const MOBILE_NAV: { id: AdminView; icon: React.ElementType; label: string }[] = [
  { id: 'cards', icon: CreditCard, label: 'Kartu' },
  { id: 'audit', icon: ClipboardList, label: 'Audit' },
  { id: 'members', icon: UserCheck, label: 'Anggota' },
]

const SECTION_LABEL: Record<AdminView, string> = {
  cards: 'Kartu',
  audit: 'Audit Log',
  members: 'Anggota',
}

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
          'hidden lg:flex flex-col bg-brand-dark text-white shrink-0 transition-all duration-200',
          collapsed ? 'w-16' : 'w-60',
        ].join(' ')}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          {!collapsed && (
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
                <ShieldCheck size={16} className="text-white" />
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
              className={['transition-transform', collapsed ? 'rotate-180' : ''].join(' ')}
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
              onClick={() => onSectionChange(id)}
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
      <div className="flex-1 flex flex-col min-w-0">
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
            <p className="type-title-bold text-foreground truncate">{SECTION_LABEL[activeSection]}</p>
            <p className="type-body2 text-muted-foreground truncate">{tenantName}</p>
          </div> 
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden bg-white border-t flex items-stretch">
          {MOBILE_NAV.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant="ghost"
              onClick={() => onSectionChange(id)}
              className={[
                'flex-1 h-auto flex-col gap-1 py-2 rounded-none text-xs',
                activeSection === id
                  ? 'text-brand font-semibold hover:text-brand'
                  : 'text-muted-foreground',
              ].join(' ')}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Button>
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
            <nav className="flex-1 px-2 py-3 space-y-0.5">
              {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
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
    <Button
      variant="ghost"
      onClick={onClick}
      title={tooltip}
      className={[
        'w-full h-auto justify-start px-3 py-2.5 rounded-lg',
        active
          ? 'bg-brand text-white hover:bg-brand/90 hover:text-white'
          : danger
            ? 'text-white/60 hover:bg-red-600/20 hover:text-red-300'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="type-body1 truncate">{label}</span>}
    </Button>
  )
}
