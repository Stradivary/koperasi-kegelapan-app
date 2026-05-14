# Block Template

A Block is a **pure render + interaction** component. No data fetching, no side-effect hooks.

## Scaffold

```tsx
// src/components/block/<BlockName>.tsx

interface <BlockName>Props {
  // data props — plain values derived by the parent Section
  // callback props — event handlers owned by the parent Section
  on<Action>?: () => void
}

export function <BlockName>({ … }: <BlockName>Props) {
  // ✅ allowed: useState for purely local UI state (open/close, hover)
  // ✅ allowed: derived display values computed from props
  // ❌ forbidden: useQuery, useMutation, fetch, useEffect with network/storage calls

  return (
    // JSX only — compose UI atoms from src/components/ui/
  )
}
```

## Real Example — NfcTapArea

```tsx
// src/components/block/NfcTapArea.tsx
interface NfcTapAreaProps {
  phase: 'idle' | 'scanning' | 'writing' | 'success' | 'error'
  onClick?: () => void
  disabled?: boolean
  tamperDetected?: boolean
}

export function NfcTapArea({ phase, onClick, disabled, tamperDetected }: NfcTapAreaProps) {
  const config = phaseConfig[phase]
  return (
    <button onClick={onClick} disabled={disabled} className={…}>
      …
    </button>
  )
}
```

## Naming Conventions

| Pattern | Example |
|---------|---------|
| Noun describing what it renders | `TransactionList`, `CardStatusBadge`, `NfcTapArea` |
| Suffix `Panel` for composed blocks | `BalancePanel`, `MemberPanel` |
| Suffix `Form` for input groups | `TopupForm`, `RegisterCardForm` |
| No `Section`, `Page`, `Screen` suffix | Those belong to higher layers |

## Props Rules

- All event handlers use the `on<Verb>` naming convention: `onTap`, `onSubmit`, `onReset`
- Avoid passing the entire domain object if only 2–3 fields are needed — destructure at the Section level
- Boolean display flags are fine: `isLoading`, `isDisabled`, `hasError`
