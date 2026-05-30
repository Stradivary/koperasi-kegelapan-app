---
inclusion: auto
---

# PowerShell Helper Commands

This project runs on Windows with PowerShell. The following helper functions are available in the developer's PowerShell profile and can be used in shell commands.

## Available Helpers

### `wc` — Word/line/character count

```powershell
wc .\src\lib\api.ts
# Returns: Lines, Words, Characters
```

### `loc` — Lines of code (excludes blanks)

```powershell
loc .\src\components
# Recursively counts non-blank lines in .ts/.tsx/.js/.jsx files
```

### `ctx` — Estimate token context length

```powershell
ctx .\src\lib\api.ts
# Returns approximate token count (chars / 4)
```

### `tree` — Directory tree (like Unix tree)

```powershell
tree .\src\components -Depth 2
# Shows directory structure up to given depth
```

### `grep` — Recursive text search (wraps Select-String)

```powershell
grep "useState" .\src -Include "*.tsx"
# Searches for pattern in files recursively
```

### `touch` — Create empty file

```powershell
touch .\src\lib\newfile.ts
```

### `head` / `tail` — Show first/last N lines

```powershell
head .\src\lib\api.ts 20
tail .\src\lib\api.ts 20
```

### `insert` — Insert text at a line number

```powershell
insert .\src\lib\api.ts 5 "import { z } from 'zod'"
# Inserts the text at line 5, shifting existing content down
```

### `append` — Append text to end of file

```powershell
append .\src\lib\api.ts "export const newFn = () => {}"
```

### `prepend` — Prepend text to beginning of file

```powershell
prepend .\src\lib\api.ts "// @ts-nocheck"
```

### `replace` — Replace all occurrences in a file

```powershell
replace .\src\lib\api.ts "oldName" "newName"
# Replaces all matches and reports count
```

## Agent Guidelines

- Prefer using Kiro's built-in tools (read_file, grep_search, list_directory) over these shell helpers when possible.
- Use these helpers when you need quick metrics (line counts, token estimates) or when combining with other shell operations.
- The `ctx` helper is useful for checking if a file is too large to include in context.
- Always use PowerShell syntax — this is a Windows environment. Do NOT use bash/unix commands.
- Use `;` to chain commands, not `&&`.

## Project-Specific Commands

| Task                 | Command                                  |
| -------------------- | ---------------------------------------- |
| Run tests            | `pnpm test`                              |
| Run single test      | `pnpm vitest run path/to/test`           |
| Type check           | `pnpm typecheck`                         |
| Lint                 | `pnpm lint`                              |
| Lint + fix           | `pnpm lint:fix`                          |
| Format               | `pnpm format`                            |
| Format check         | `pnpm format:check`                      |
| Dev server           | `pnpm dev` (port 3000)                   |
| API dev server       | `pnpm dev:api` (port 8787)               |
| Build                | `pnpm build`                             |
| DB migrate (local)   | `pnpm db:local:migrate`                  |
| Add shadcn component | `pnpm dlx shadcn@latest add <component>` |
