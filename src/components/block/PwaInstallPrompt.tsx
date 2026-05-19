import { useInstallPrompt } from "../../hooks/useInstallPrompt";

export function PwaInstallPrompt() {
  const { canInstall, install, dismiss } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-brand-dark text-white rounded-2xl shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="type-body1-bold text-white">Install Aplikasi</p>
          <p className="type-body2 text-white/70">
            Tambahkan ke home screen untuk akses cepat &amp; offline
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={dismiss}
            className="px-3 py-1.5 rounded-lg type-body2 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Nanti
          </button>
          <button
            onClick={() => install()}
            className="px-3 py-1.5 rounded-lg type-body2-bold bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
