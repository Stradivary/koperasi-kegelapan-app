/**
 * Admin — Admin User Management Page
 *
 * Manage admin users: create, suspend, modify roles.
 * Accessible to super_admin and tenant_admin only.
 *
 * Requirements: 12.3
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { AdminLayout } from '#/components/admin/index.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'

export const Route = createFileRoute('/admin/users')({
  component: AdminUsersPage,
})

// Mock data
const MOCK_ADMINS = [
  { id: 'u1', name: 'Super Admin', email: 'super@mbc.id', role: 'super_admin' as const, status: 'active' as const, lastLoginAt: new Date() },
  { id: 'u2', name: 'Tenant Admin A', email: 'admin-a@koperasi.id', role: 'tenant_admin' as const, status: 'active' as const, lastLoginAt: new Date(Date.now() - 86400000) },
  { id: 'u3', name: 'Operator 1', email: 'op1@koperasi.id', role: 'operator' as const, status: 'active' as const, lastLoginAt: new Date(Date.now() - 3600000) },
  { id: 'u4', name: 'Operator 2', email: 'op2@koperasi.id', role: 'operator' as const, status: 'suspended' as const, lastLoginAt: null },
]

function AdminUsersPage() {
  const [admins, setAdmins] = useState(MOCK_ADMINS)
  const [showCreate, setShowCreate] = useState(false)
  const [newAdmin, setNewAdmin] = useState({
    name: '',
    email: '',
    role: 'operator' as 'super_admin' | 'tenant_admin' | 'operator',
  })

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      // TODO: Call createAdminUser server function
      const created = {
        id: `u${admins.length + 1}`,
        ...newAdmin,
        status: 'active' as const,
        lastLoginAt: null,
      }
      setAdmins((prev) => [...prev, created])
      setShowCreate(false)
      setNewAdmin({ name: '', email: '', role: 'operator' })
    },
    [newAdmin, admins.length],
  )

  const handleToggleStatus = useCallback(
    (adminId: string) => {
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === adminId
            ? {
                ...a,
                status: a.status === 'active' ? ('suspended' as const) : ('active' as const),
              }
            : a,
        ),
      )
    },
    [],
  )

  return (
    <AdminLayout activePage="admin-users">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Admin Users</h2>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            aria-label="Create new admin user"
            className="min-h-[48px]"
          >
            {showCreate ? 'Cancel' : 'Create Admin'}
          </Button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="rounded-lg border border-border bg-card p-6"
            aria-label="Create new admin user"
          >
            <h3 className="mb-4 text-lg font-semibold">New Admin User</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="admin-name" className="mb-1">
                  Name
                </Label>
                <Input
                  id="admin-name"
                  value={newAdmin.name}
                  onChange={(e) =>
                    setNewAdmin((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Full name"
                  aria-required="true"
                  className="min-h-[48px]"
                />
              </div>
              <div>
                <Label htmlFor="admin-email" className="mb-1">
                  Email
                </Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) =>
                    setNewAdmin((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="admin@example.com"
                  aria-required="true"
                  className="min-h-[48px]"
                />
              </div>
              <div>
                <Label htmlFor="admin-role" className="mb-1">
                  Role
                </Label>
                <Select
                  value={newAdmin.role}
                  onValueChange={(v) =>
                    setNewAdmin((p) => ({
                      ...p,
                      role: v as typeof newAdmin.role,
                    }))
                  }
                >
                  <SelectTrigger
                    id="admin-role"
                    aria-label="Admin role"
                    className="min-h-[48px] w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              className="mt-4 min-h-[48px]"
              aria-label="Submit new admin user"
            >
              Create
            </Button>
          </form>
        )}

        {/* Admin Users List */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table
            className="w-full text-sm"
            role="table"
            aria-label="Admin users list"
          >
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="p-3 font-medium text-muted-foreground">Name</th>
                <th className="p-3 font-medium text-muted-foreground">
                  Email
                </th>
                <th className="p-3 font-medium text-muted-foreground">Role</th>
                <th className="p-3 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  Last Login
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr
                  key={admin.id}
                  className="border-b border-border/50"
                >
                  <td className="p-3 font-medium">{admin.name}</td>
                  <td className="p-3 text-muted-foreground">{admin.email}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        admin.role === 'super_admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : admin.role === 'tenant_admin'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {admin.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        admin.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {admin.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {admin.lastLoginAt
                      ? admin.lastLoginAt.toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(admin.id)}
                      aria-label={`${admin.status === 'active' ? 'Suspend' : 'Activate'} ${admin.name}`}
                      className="min-h-[48px] min-w-[48px]"
                    >
                      {admin.status === 'active' ? 'Suspend' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  )
}
