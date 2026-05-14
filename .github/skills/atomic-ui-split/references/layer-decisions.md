# Layer Decision Guide

Use this reference when you are unsure which layer a piece of code belongs to.

## Decision Tree

```
Is it purely structural (slots, children, CSS grid/flex wrapper)?
  └─ YES → Layout

Is it a primitive atom (Button, Input, Badge, Icon)?
  └─ YES → UI (src/components/ui/)

Does it call useQuery, useMutation, fetch, or useEffect with network/storage?
  └─ YES → must live in a hook (src/hooks/) OR a Section, never a Block

Does it only render props and fire callbacks?
  └─ YES → Block

Does it compose Blocks and call hooks to supply their data?
  └─ YES → Section

Does it extract route params and pass them to a Section?
  └─ YES → Route
```

## Grey Area Cases

### "I need a small form inside a Block"

A Block **can** have local `useState` for controlled inputs.
The Block **must not** call `useMutation` — pass `onSubmit: (value) => Promise<void>` from the Section.

```tsx
// ✅ Block
function TopupForm({ onSubmit, isPending }: TopupFormProps) {
  const [amount, setAmount] = useState('')
  return <form onSubmit={() => onSubmit(amount)}>…</form>
}

// ✅ Section supplies the mutation
const { mutateAsync } = useTopupMutation(tenantId)
<TopupForm onSubmit={mutateAsync} isPending={isPending} />
```

### "My Section is getting large — should I split into sub-Sections?"

No. Split into more Blocks. Sub-Sections create ambiguity about which layer owns state.
Exception: if two independent hook-driven features coexist on one screen and neither needs to communicate, they may each be a separate Section rendered side-by-side by the Route.

### "I have a tab component that switches between two different data sets"

The Section owns the tab state and queries both data sets. Each tab's content is its own Block.

```tsx
// Section
const [tab, setTab] = useState<'cards' | 'members'>('cards')
const { cards } = useCards(tenantId)
const { members } = useMembers(tenantId)

return (
  <>
    <TabBar active={tab} onChange={setTab} />
    {tab === 'cards'   && <CardListBlock cards={cards} />}
    {tab === 'members' && <MemberListBlock members={members} />}
  </>
)
```

### "My Layout needs to know the tenant name for the header"

Display strings (title, tenantName, subtitle) are **allowed** as Layout props — they are presentation, not business data.
What is **not** allowed: passing a raw `Card` object, a `useQuery` result, or an array of domain items into a Layout.

### "Should the route handle loading/error UI?"

Yes — TanStack Router's `pendingComponent` and `errorComponent` options handle global loading and error states at the route level.
The Section should not render its own `if (isLoading) return <Spinner />` at the top level; use `suspense: true` on queries or `pendingComponent` on the route.
Local async state inside a Section (e.g., an NFC scan in progress) is fine to handle inline.

### "Where does a helper function like `getCardsWithUsers` live?"

If it is a pure async DB/API utility with no React dependency → `src/db/` or `src/lib/`.
If it is called inside a `useQuery` → colocate in the hook file `src/hooks/use<Domain>.ts`.
Never define it inside a Section or Block component body.

## File Placement Quick Reference

```
src/
  routes/               ← Route files (TanStack file-based routing)
  components/
    section/            ← <Name>Section.tsx
    block/              ← <Name>Block.tsx | <Name>List.tsx | <Name>Form.tsx
    layout/             ← <Name>Layout.tsx
    ui/                 ← primitives (shadcn/ui, custom atoms)
  hooks/                ← use<Domain>.ts — data fetching + domain state
  core/                 ← pure business logic (no React)
  db/                   ← DB access, query helpers
  lib/                  ← general utilities
```
