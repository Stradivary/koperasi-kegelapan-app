import { BRAND } from '../../lib/brand'

interface KioskLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  tenantName: string
  trailing?: React.ReactNode
}

export function KioskLayout({ children, title, subtitle, tenantName, trailing }: KioskLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-signal-disable">
      <header className="bg-brand text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <p className="type-h6 text-white leading-tight">{BRAND.APP_NAME}</p>
          <p className="type-body2 text-white/60">{BRAND.BYLINE}</p>
        </div>
        <div className="text-right min-w-0">
          <p className="type-body2 text-white/60 truncate">{tenantName}</p>
          <p className="type-body1-bold text-white">{title}</p>
          {subtitle && <p className="type-body2 text-white/70">{subtitle}</p>}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
