/**
 * Admin — Member Management Page
 *
 * Searchable member list and application approval queue.
 *
 * Requirements: 2.3, 2.4, 2.5
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { AdminLayout } from '#/components/admin/index.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'

export const Route = createFileRoute('/admin/members')({
  component: MemberManagementPage,
})

type ViewMode = 'members' | 'applications'

// Mock data
const MOCK_MEMBERS = [
  { id: '1', memberId: 'MBC-1001', fullName: 'Ahmad Suryadi', phone: '081234567890', cardStatus: 'active' as const, identityNumber: '3201010101010001' },
  { id: '2', memberId: 'MBC-1002', fullName: 'Siti Nurhaliza', phone: '081234567891', cardStatus: 'active' as const, identityNumber: '3201010101010002' },
  { id: '3', memberId: 'MBC-1003', fullName: 'Budi Santoso', phone: '081234567892', cardStatus: 'unissued' as const, identityNumber: '3201010101010003' },
]

const MOCK_APPLICATIONS = [
  { id: 'a1', fullName: 'Dewi Lestari', identityNumber: '3201010101010004', phone: '081234567893', status: 'pending' as const, submittedAt: new Date() },
  { id: 'a2', fullName: 'Eko Prasetyo', identityNumber: '3201010101010005', phone: '081234567894', status: 'pending' as const, submittedAt: new Date() },
  { id: 'a3', fullName: 'Fitri Handayani', identityNumber: '3201010101010006', phone: '081234567895', status: 'pending' as const, submittedAt: new Date() },
]

function MemberManagementPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('members')
  const [search, setSearch] = useState('')
  const [members] = useState(MOCK_MEMBERS)
  const [applications, setApplications] = useState(MOCK_APPLICATIONS)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const filteredMembers = members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(search.toLowerCase()) ||
      m.memberId.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search) ||
      m.identityNumber.includes(search),
  )

  const handleApprove = useCallback(
    async (applicationId: string) => {
      // TODO: Call approveMember server function
      setApplications((prev) =>
        prev.filter((a) => a.id !== applicationId),
      )
    },
    [],
  )

  const handleReject = useCallback(
    async (applicationId: string) => {
      if (!rejectReason.trim()) return
      // TODO: Call rejectMember server function
      setApplications((prev) =>
        prev.filter((a) => a.id !== applicationId),
      )
      setRejectingId(null)
      setRejectReason('')
    },
    [rejectReason],
  )

  return (
    <AdminLayout activePage="members">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">Member Management</h2>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'members' ? 'default' : 'outline'}
              onClick={() => setViewMode('members')}
              aria-label="View members list"
              className="min-h-[48px]"
            >
              Members
            </Button>
            <Button
              variant={viewMode === 'applications' ? 'default' : 'outline'}
              onClick={() => setViewMode('applications')}
              aria-label="View pending applications"
              className="min-h-[48px]"
            >
              Applications ({applications.length})
            </Button>
          </div>
        </div>

        {/* Members List */}
        {viewMode === 'members' && (
          <div className="space-y-4">
            <Input
              placeholder="Search by name, ID, phone, or identity number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search members"
              className="min-h-[48px]"
            />

            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table
                className="w-full text-sm"
                role="table"
                aria-label="Members list"
              >
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="p-3 font-medium text-muted-foreground">
                      Member ID
                    </th>
                    <th className="p-3 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="p-3 font-medium text-muted-foreground">
                      Phone
                    </th>
                    <th className="p-3 font-medium text-muted-foreground">
                      Card Status
                    </th>
                    <th className="p-3 font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-border/50"
                    >
                      <td className="p-3 font-medium">{member.memberId}</td>
                      <td className="p-3">{member.fullName}</td>
                      <td className="p-3">{member.phone}</td>
                      <td className="p-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            member.cardStatus === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                              : member.cardStatus === 'unissued'
                                ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}
                        >
                          {member.cardStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View details for ${member.fullName}`}
                          className="min-h-[48px] min-w-[48px]"
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-muted-foreground"
                      >
                        No members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Applications Queue */}
        {viewMode === 'applications' && (
          <div className="space-y-4">
            {applications.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
                No pending applications.
              </div>
            ) : (
              applications.map((app) => (
                <div
                  key={app.id}
                  className="rounded-lg border border-border bg-card p-4"
                  role="article"
                  aria-label={`Application from ${app.fullName}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        {app.fullName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        KTP: {app.identityNumber} · Phone: {app.phone}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Submitted:{' '}
                        {app.submittedAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(app.id)}
                        aria-label={`Approve ${app.fullName}`}
                        className="min-h-[48px] min-w-[48px] bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          setRejectingId(
                            rejectingId === app.id ? null : app.id,
                          )
                        }
                        aria-label={`Reject ${app.fullName}`}
                        className="min-h-[48px] min-w-[48px]"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>

                  {rejectingId === app.id && (
                    <div className="mt-3 space-y-2">
                      <Label htmlFor={`reject-${app.id}`}>
                        Rejection Reason
                      </Label>
                      <Input
                        id={`reject-${app.id}`}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter reason for rejection..."
                        aria-label="Rejection reason"
                        className="min-h-[48px]"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleReject(app.id)}
                        disabled={!rejectReason.trim()}
                        aria-label="Confirm rejection"
                        className="min-h-[48px]"
                      >
                        Confirm Rejection
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
