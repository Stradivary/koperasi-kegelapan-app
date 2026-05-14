import { createFileRoute } from '@tanstack/react-router'
import { AdminSection } from '../components/section/AdminSection'

export const Route = createFileRoute('/tenant/$tenantId/admin')({
  component: AdminPage,
})

function AdminPage() {
  const { tenantId } = Route.useParams()
  const { tenantContext } = Route.useRouteContext()
  return (
    <AdminSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={0}
      role={tenantContext.role}
    />
  )
}
