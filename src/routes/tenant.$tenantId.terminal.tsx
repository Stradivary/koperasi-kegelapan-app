import { createFileRoute } from '@tanstack/react-router'
import { TerminalSection } from '../components/section/TerminalSection'

export const Route = createFileRoute('/tenant/$tenantId/terminal')({
  component: TerminalPage,
})

function TerminalPage() {
  const { tenantId } = Route.useParams()
  const { tenantContext } = Route.useRouteContext()
  return (
    <TerminalSection
      tenantId={tenantId}
      tenantName={tenantContext.tenantName}
      accountId={tenantContext.accountId}
      deviceId={tenantContext.deviceId}
      terminalId={42}
    />
  )
}
