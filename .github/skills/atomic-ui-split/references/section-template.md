# Section Template

A Section is the **orchestration** layer. It owns hooks and state, then passes results down to Blocks.

## Scaffold

```tsx
// src/components/section/<Name>Section.tsx

interface <Name>SectionProps {
  // Only route-derived values: tenantId, accountId, deviceId, terminalId, …
  tenantId: string
}

export function <Name>Section({ tenantId }: <Name>SectionProps) {
  // 1. Hooks — data fetching and domain state
  const { … } = use<Domain>(tenantId)

  // 2. Local UI state — tabs, views, modal open/close
  const [view, setView] = useState<'list' | 'detail'>('list')

  // 3. Derived values — computed from hook results
  const displayItems = data?.map(…) ?? []

  // 4. Handlers — call hook mutations, then update local state
  async function handleSubmit(value: string) {
    await mutate(value)
    setView('list')
  }

  // 5. Render — Layout wrapping Blocks
  return (
    <SomeLayout title="…" tenantName={tenantId}>
      <SomeBlock
        items={displayItems}
        onSubmit={handleSubmit}
        isLoading={isPending}
      />
    </SomeLayout>
  )
}
```

## Real Example — GateSection (condensed)

```tsx
export function GateSection({ tenantId, tenantName, accountId, deviceId, terminalId }: GateSectionProps) {
  const { grant, loading } = useSessionGrant(tenantId, accountId, deviceId)
  const { state, scan, write, reset } = useNfcCard(grant, tenantId, terminalId)

  async function handleCheckin() { … }
  async function handleCheckout() { … }

  return (
    <KioskLayout title="Akses Masuk" tenantName={tenantName}>
      <NfcTapArea phase={state.phase} onClick={scan} disabled={!grant} />
      <Button onClick={handleCheckin}>Check-in</Button>
    </KioskLayout>
  )
}
```

## Size Heuristic

| Lines of JSX | Action                                               |
| ------------ | ---------------------------------------------------- |
| < 80         | Fine as-is                                           |
| 80 – 150     | Consider extracting repeated visual groups to Blocks |
| > 150        | Must extract — split by tab/view into sub-Blocks     |

## What Belongs in the Section vs. a Block

| Code                       | Section                 | Block             |
| -------------------------- | ----------------------- | ----------------- |
| `useQuery(…)`              | ✅                      | ❌                |
| `useState` for tab         | ✅                      | local UI only     |
| `<table>` rows map         | ❌ → Block              | ✅                |
| `async handleSubmit`       | ✅                      | ❌ (pass as prop) |
| Conditional branch per tab | ✅ (decide which Block) | ❌                |
| CSS layout wrapper         | ❌ → Layout             | ❌                |
