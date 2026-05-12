import { createFileRoute } from '@tanstack/react-router'
import { ScoutSection } from '../components/section/ScoutSection'

export const Route = createFileRoute('/tenant/$tenantId/scout')({
  component: ScoutPage,
})

function ScoutPage() {
  const { tenantId } = Route.useParams()
  const { tenantContext } = Route.useRouteContext()
  return (
    <ScoutSection
      tenantId={tenantId}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={0}
    />
  )
}
