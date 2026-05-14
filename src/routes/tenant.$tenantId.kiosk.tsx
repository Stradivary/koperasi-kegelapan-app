import { createFileRoute } from '@tanstack/react-router'
import { KioskSection } from '../components/section/KioskSection'

export const Route = createFileRoute('/tenant/$tenantId/kiosk')({
  component: KioskPage,
})

function KioskPage() {
  const { tenantId } = Route.useParams()
  const { tenantContext } = Route.useRouteContext()
  return (
    <KioskSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={1}
    />
  )
}
