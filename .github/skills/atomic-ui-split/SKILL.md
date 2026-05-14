---
name: atomic-ui-split
description: >
  Maintain and enforce the project's 4-layer UI atomic design hierarchy:
  Route → Section → Block → Layout/UI.
  Use when: splitting a section into blocks, creating a new section, auditing
  component responsibilities, refactoring data-fetching out of blocks, moving
  routing logic out of sections, checking which layer a component belongs to.
argument-hint: 'section file or component name to split/audit'
---

# Atomic UI Split

Enforces the **Route → Section → Block → Layout/UI** hierarchy used in this project.

## Layer Definitions

| Layer | Folder | Responsibility | Forbidden |
|-------|--------|---------------|-----------|
| **Route** | `src/routes/` | Extract route params, pass to Section, handle routing states (loading, error, notFound) | Business logic, data fetching, render logic |
| **Section** | `src/components/section/` | Call hooks, own state, orchestrate Blocks | Direct API calls outside hooks, layout decisions |
| **Block** | `src/components/block/` | Render data, handle user activity (callbacks via props) | Data fetching, hooks with side effects, `useQuery`/`useMutation` |
| **Layout** | `src/components/layout/` | Define slot structure (`children`, named slots) | Business logic, hooks, data |
| **UI** | `src/components/ui/` | Primitive atoms (Button, Input, Badge, …) | Any domain knowledge, based on shadcn |

## When to Use

- A Section file exceeds ~150 lines of JSX
- A Block contains `useQuery`, `useMutation`, or `fetch` calls
- A Route file contains business logic beyond param extraction
- A Layout receives data props beyond display strings
- You are creating a new screen and need to scaffold all layers

## Procedure

### 1. Audit the Target File

Read the target Section (or candidate component). Categorise each chunk:

- **Hook calls** → stays in Section
- **Pure render with typed props** → extract to Block
- **Slot/wrapper structure** → extract to Layout
- **Param access + routing lifecycle** → belongs in Route

See [Layer Decision Guide](./references/layer-decisions.md) for edge cases.

### 2. Extract Blocks

For each visual chunk identified:

1. Create `src/components/block/<BlockName>.tsx`
2. Move JSX + local display logic into the Block
3. Replace any hook calls with explicit props (callbacks, data)
4. Use the [Block template](./references/block-template.md)

Rules:
- Props must be typed with an explicit `interface <Name>Props`
- No `useQuery`, `useMutation`, `fetch`, or `useEffect` with side effects
- Event handlers passed in as `on<Action>: () => void` props

### 3. Clean the Section

After extracting blocks:

1. Section only contains: hook calls, state declarations, derived values, and Block composition
2. Each Block receives only what it needs — no prop drilling through intermediate components
3. Use the [Section template](./references/section-template.md)

### 4. Verify the Route

Check the corresponding `src/routes/tenant.$tenantId.<name>.tsx`:

1. Only calls `Route.useParams()` and `Route.useRouteContext()`
2. Passes extracted values as flat props to the Section
3. Routing states (pending, error) handled via TanStack Router conventions (`pendingComponent`, `errorComponent`) — not inside the Section

### 5. Validate

Run through this checklist before finishing:

- [ ] No `useQuery`/`useMutation`/`fetch` in any Block
- [ ] No JSX render logic in any Route file beyond the single `<Section … />` return
- [ ] No data props (beyond display strings) in any Layout
- [ ] Every component has an explicit typed `interface <Name>Props`
- [ ] Section composes Blocks only — no raw HTML structures that belong in a Block
- [ ] Blocks are independently renderable with mock props (no hidden hook dependencies)

## Layer Examples from This Codebase

```
Route  src/routes/tenant.$tenantId.gate.tsx       ← params + context → GateSection
Section  src/components/section/GateSection.tsx   ← useNfcCard + useSessionGrant → NfcTapArea, KioskLayout
Block    src/components/block/NfcTapArea.tsx       ← phase prop, onClick prop, pure render
Layout   src/components/layout/KioskLayout.tsx    ← children + title + trailing slots
```

## References

- [Layer Decision Guide](./references/layer-decisions.md) — edge cases, grey areas
- [Block Template](./references/block-template.md) — copy-paste scaffold
- [Section Template](./references/section-template.md) — copy-paste scaffold
