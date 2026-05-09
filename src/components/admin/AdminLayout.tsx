/**
 * Admin Dashboard Layout
 *
 * Shared layout for all admin pages with navigation sidebar,
 * multi-tenant switcher, and Signal UI styling.
 *
 * Requirements: 16.1, 16.3
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Button } from '#/components/ui/button.tsx'

interface AdminLayoutProps {
  children: React.ReactNode
  activePage?: string
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin' },
  { id: 'members', label: 'Members', href: '/admin/members' },
  { id: 'terminals', label: 'Terminals', href: '/admin/terminals' },
  { id: 'analytics', label: 'Analytics', href: '/admin/analytics' },
  { id: 'tenant-config', label: 'Configuration', href: '/admin/config' },
  { id: 'admin-users', label: 'Admin Users', href: '/admin/users' },
]

export function AdminLayout({ children, activePage }: AdminLayoutProps) {
  const [activeTenant, setActiveTenant] = useState('tenant-1')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        className="fixed left-4 top-4 z-50 min-h-[48px] min-w-[48px] lg:hidden"
      >
        <span aria-hidden="true">{sidebarOpen ? '✕' : '☰'}</span>
      </Button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-card transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="navigation"
        aria-label="Admin navigation"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-border p-4">
            <h1 className="text-lg font-bold">MBC Admin</h1>
            <div className="mt-3">
              <Select value={activeTenant} onValueChange={setActiveTenant}>
                <SelectTrigger
                  aria-label="Switch tenant"
                  className="min-h-[48px] w-full"
                >
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant-1">Koperasi Desa A</SelectItem>
                  <SelectItem value="tenant-2">Koperasi Desa B</SelectItem>
                  <SelectItem value="tenant-3">Koperasi Desa C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2">
            <ul className="space-y-1" role="list">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className={`flex min-h-[48px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      activePage === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                    aria-current={activePage === item.id ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className="border-t border-border p-4 text-xs text-muted-foreground">
            MBC System v1.0
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
