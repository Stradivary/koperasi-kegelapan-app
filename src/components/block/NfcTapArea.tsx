import { Wifi } from 'lucide-react'

type NfcPhase = 'idle' | 'scanning' | 'validating' | 'ready' | 'writing' | 'success' | 'error'

interface NfcTapAreaProps {
  phase: NfcPhase
  onClick?: () => void
  disabled?: boolean
  label?: string
  sublabel?: string
  tamperDetected?: boolean
}

const phaseConfig = {
  idle: {
    border: 'border-brand/30 border-dashed',
    bg: 'bg-white',
    iconColor: 'text-brand',
    ringClass: '',
    label: 'Tempelkan Kartu',
    sublabel: 'Dekatkan ke area NFC',
  },
  scanning: {
    border: 'border-brand',
    bg: 'bg-brand/5',
    iconColor: 'text-brand',
    ringClass: 'nfc-ring-pulse',
    label: 'Menunggu kartu...',
    sublabel: 'Jangan pindahkan perangkat',
  },
  validating: {
    border: 'border-brand',
    bg: 'bg-brand/5',
    iconColor: 'text-brand',
    ringClass: 'nfc-ring-pulse',
    label: 'Memvalidasi...',
    sublabel: 'Jangan pindahkan kartu',
  },
  ready: {
    border: 'border-signal-valid',
    bg: 'bg-signal-bg-valid',
    iconColor: 'text-signal-valid',
    ringClass: '',
    label: 'Kartu Siap',
    sublabel: 'Pilih tindakan',
  },
  writing: {
    border: 'border-signal-warning',
    bg: 'bg-signal-bg-warning',
    iconColor: 'text-signal-warning',
    ringClass: 'nfc-ring-spin',
    label: 'Memproses...',
    sublabel: 'Jangan pindahkan kartu',
  },
  success: {
    border: 'border-signal-valid',
    bg: 'bg-signal-bg-valid',
    iconColor: 'text-signal-valid',
    ringClass: '',
    label: 'Berhasil',
    sublabel: '',
  },
  error: {
    border: 'border-signal-error',
    bg: 'bg-signal-bg-error',
    iconColor: 'text-signal-error',
    ringClass: 'nfc-shake',
    label: 'Gagal',
    sublabel: 'Coba lagi',
  },
}

export function NfcTapArea({
  phase,
  onClick,
  disabled,
  label,
  sublabel,
  tamperDetected,
}: NfcTapAreaProps) {
  const config = phaseConfig[phase]
  const displayLabel = tamperDetected ? '⚠ Kartu terdeteksi rusak' : (label ?? config.label)
  const displaySublabel = tamperDetected ? 'Hubungi petugas' : (sublabel ?? config.sublabel)

  return (
    <button
      onClick={phase === 'idle' ? onClick : undefined}
      disabled={disabled || phase !== 'idle'}
      className={[
        'relative flex flex-col items-center justify-center gap-3',
        'w-48 h-48 rounded-full border-2 transition-all duration-300',
        'focus:outline-none',
        config.bg,
        config.border,
        phase === 'idle' && !disabled ? 'cursor-pointer hover:border-brand hover:bg-brand/5 active:scale-95' : 'cursor-default',
        disabled && phase === 'idle' ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Outer pulse ring */}
      {(phase === 'idle' || phase === 'scanning' || phase === 'validating') && (
        <span
          className={[
            'absolute inset-0 rounded-full border-2 border-brand/20',
            config.ringClass,
          ].join(' ')}
        />
      )}

      {/* Icon */}
      <span className={['transition-colors', config.iconColor].join(' ')}>
        {phase === 'success' ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : phase === 'error' ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <Wifi size={48} className={phase === 'scanning' || phase === 'validating' || phase === 'writing' ? 'animate-pulse' : ''} />
        )}
      </span>

      {/* Label under icon */}
      <span className={['type-body2-bold text-center px-2', config.iconColor].join(' ')}>
        {displayLabel}
      </span>
    </button>
  )
}

interface NfcStatusLabelProps {
  phase: NfcPhase
  error?: string | null
  tamperDetected?: boolean
}

export function NfcStatusLabel({ phase, error, tamperDetected }: NfcStatusLabelProps) {
  if (phase === 'error') {
    return (
      <p className="type-body2 text-signal-error text-center">
        {tamperDetected ? '⚠ Kartu terdeteksi rusak' : (error ?? 'Gagal membaca kartu')}
      </p>
    )
  }
  if (phase === 'scanning') {
    return <p className="type-body2 text-signal-text-secondary text-center animate-pulse">Menunggu kartu NFC...</p>
  }
  if (phase === 'writing') {
    return <p className="type-body2 text-signal-warning text-center animate-pulse">Menulis kartu, jangan pindahkan...</p>
  }
  return null
}
