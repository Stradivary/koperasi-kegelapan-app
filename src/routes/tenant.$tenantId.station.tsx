import { createFileRoute } from '@tanstack/react-router'
import { StationSection } from '../components/section/StationSection'

export const Route = createFileRoute('/tenant/$tenantId/station')({
  component: StationPage,
})

function StationPage() {
  const { tenantId } = Route.useParams()
  const { tenantContext } = Route.useRouteContext()
  return (
    <StationSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      role={tenantContext.role}
    />
  )
}
