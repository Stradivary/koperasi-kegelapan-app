import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Check for updates every hour
        setInterval(() => r.update(), 60 * 60 * 1000)
      }
    },
  })

  const [dismissed, setDismissed] = useState(false)

  if (!needRefresh || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-brand-dark text-white rounded-2xl shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="type-body1-bold text-white">Update tersedia</p>
          <p className="type-body2 text-white/70">Versi baru aplikasi siap diinstal</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1.5 rounded-lg type-body2 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Nanti
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            className="px-3 py-1.5 rounded-lg type-body2-bold bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  )
}
