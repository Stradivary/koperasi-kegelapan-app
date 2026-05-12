import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { tenantContextStore } from '../lib/indexeddb'

export const Route = createFileRoute('/tenant/$tenantId')({
  beforeLoad: async ({ params }) => {
    const ctx = await tenantContextStore.get(params.tenantId)
    if (!ctx) {
      throw redirect({ to: '/', search: { redirect: `/tenant/${params.tenantId}` } })
    }
    return { tenantContext: ctx }
  },
  component: TenantLayout,
})

function TenantLayout() {
  const { tenantId } = Route.useParams()
  const { tenantContext } = Route.useRouteContext()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{tenantContext.tenantName}</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {tenantContext.role}
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {tenantContext.role === 'terminal' && (
            <Link to="/tenant/$tenantId/terminal" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
              Terminal
            </Link>
          )}
          {tenantContext.role === 'gate' && (
            <Link to="/tenant/$tenantId/gate" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
              Gate
            </Link>
          )}
          {tenantContext.role === 'kiosk' && (
            <Link to="/tenant/$tenantId/kiosk" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
              Kiosk
            </Link>
          )}
          {tenantContext.role === 'scout' && (
            <Link to="/tenant/$tenantId/scout" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
              Cek Saldo
            </Link>
          )}
          {tenantContext.role === 'station' && (
            <>
              <Link to="/tenant/$tenantId/station" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
                Station
              </Link>
              <Link to="/tenant/$tenantId/admin" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
                Admin
              </Link>
            </>
          )}
          {tenantContext.role === 'admin' && (
            <Link to="/tenant/$tenantId/admin" params={{ tenantId }} className="nav-link" activeProps={{ className: 'nav-link font-semibold' }}>
              Admin
            </Link>
          )}
          <Link to="/" className="nav-link text-muted-foreground">
            Switch Tenant
          </Link>
        </nav>
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}
