/**
 * Admin — Terminal Management Page
 *
 * Terminal list with health status, last heartbeat, and registration form.
 *
 * Requirements: 10.1, 10.3
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

export const Route = createFileRoute('/admin/terminals')({
  component: TerminalManagementPage,
})

// Mock data
const MOCK_TERMINALS = [
  { id: 't1', name: 'Gate Entrance A', type: 'gate', status: 'active', location: 'Main Entrance', lastHeartbeat: new Date() },
  { id: 't2', name: 'Exit Terminal B', type: 'terminal', status: 'active', location: 'Main Exit', lastHeartbeat: new Date() },
  { id: 't3', name: 'Station Front Desk', type: 'station', status: 'active', location: 'Front Office', lastHeartbeat: new Date(Date.now() - 3600000) },
  { id: 't4', name: 'Scout Mobile 1', type: 'scout', status: 'active', location: 'Field', lastHeartbeat: new Date() },
  { id: 't5', name: 'Gate Entrance B', type: 'gate', status: 'inactive', location: 'Side Entrance', lastHeartbeat: null },
]

function TerminalManagementPage() {
  const [terminals] = useState(MOCK_TERMINALS)
  const [showRegister, setShowRegister] = useState(false)
  const [newTerminal, setNewTerminal] = useState({
    name: '',
    type: 'gate',
    location: '',
  })

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      // TODO: Call registerTerminal server function
      setShowRegister(false)
      setNewTerminal({ name: '', type: 'gate', location: '' })
    },
    [newTerminal],
  )

  return (
    <AdminLayout activePage="terminals">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Terminal Management</h2>
          <Button
            onClick={() => setShowRegister(!showRegister)}
            aria-label="Register new terminal"
            className="min-h-[48px]"
          >
            {showRegister ? 'Cancel' : 'Register Terminal'}
          </Button>
        </div>

        {/* Registration Form */}
        {showRegister && (
          <form
            onSubmit={handleRegister}
            className="rounded-lg border border-border bg-card p-6"
            aria-label="Register new terminal"
          >
            <h3 className="mb-4 text-lg font-semibold">
              Register New Terminal
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="term-name" className="mb-1">
                  Name
                </Label>
                <Input
                  id="term-name"
                  value={newTerminal.name}
                  onChange={(e) =>
                    setNewTerminal((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Terminal name"
                  aria-required="true"
                  className="min-h-[48px]"
                />
              </div>
              <div>
                <Label htmlFor="term-type" className="mb-1">
                  Type
                </Label>
                <Select
                  value={newTerminal.type}
                  onValueChange={(v) =>
                    setNewTerminal((p) => ({ ...p, type: v }))
                  }
                >
                  <SelectTrigger
                    id="term-type"
                    aria-label="Terminal type"
                    className="min-h-[48px] w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gate">Gate (Entry)</SelectItem>
                    <SelectItem value="terminal">Terminal (Exit)</SelectItem>
                    <SelectItem value="station">Station (Desktop)</SelectItem>
                    <SelectItem value="scout">Scout (Mobile)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="term-location" className="mb-1">
                  Location
                </Label>
                <Input
                  id="term-location"
                  value={newTerminal.location}
                  onChange={(e) =>
                    setNewTerminal((p) => ({
                      ...p,
                      location: e.target.value,
                    }))
                  }
                  placeholder="Physical location"
                  className="min-h-[48px]"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="mt-4 min-h-[48px]"
              aria-label="Submit terminal registration"
            >
              Register
            </Button>
          </form>
        )}

        {/* Terminal List */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table
            className="w-full text-sm"
            role="table"
            aria-label="Terminals list"
          >
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="p-3 font-medium text-muted-foreground">Name</th>
                <th className="p-3 font-medium text-muted-foreground">Type</th>
                <th className="p-3 font-medium text-muted-foreground">
                  Location
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  Last Heartbeat
                </th>
                <th className="p-3 font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {terminals.map((terminal) => (
                <tr
                  key={terminal.id}
                  className="border-b border-border/50"
                >
                  <td className="p-3 font-medium">{terminal.name}</td>
                  <td className="p-3">
                    <span className="inline-block rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                      {terminal.type}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {terminal.location || '—'}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${
                        terminal.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          terminal.status === 'active'
                            ? 'bg-emerald-500'
                            : 'bg-red-500'
                        }`}
                        aria-hidden="true"
                      />
                      {terminal.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {terminal.lastHeartbeat
                      ? terminal.lastHeartbeat.toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Manage ${terminal.name}`}
                      className="min-h-[48px] min-w-[48px]"
                    >
                      Manage
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
