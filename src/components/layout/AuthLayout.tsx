import { BRAND } from '../../lib/brand'

interface AuthLayoutProps {
  children: React.ReactNode
  headerSubtitle?: string
  variant?: 'brand' | 'brand-dark'
  align?: 'top' | 'center'
}

export function AuthLayout({
  children,
  headerSubtitle = BRAND.BYLINE,
  variant = 'brand',
  align = 'center',
}: AuthLayoutProps) {
  const headerBg = variant === 'brand-dark' ? 'bg-brand-dark' : 'bg-brand'
  const containerAlign = align === 'center' ? 'items-center' : 'items-start pt-4'

  return (
    <div className="min-h-screen flex flex-col bg-signal-disable">
      <div className={`${headerBg} text-white text-center py-8 px-4`}>
        <p className="type-h3 text-white">{BRAND.APP_NAME}</p>
        <p className="type-body1 text-white/70 mt-1">{headerSubtitle}</p>
      </div>

      <div className={`flex-1 flex justify-center p-6 ${containerAlign}`}>
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-5">
          {children}
        </div>
      </div>
    </div>
  )
}
