# Software Quality

[← Back to README](../README.md)

## Quality Gates Overview

```mermaid
graph LR
    subgraph Local["Local Development"]
        Code["Code Change"]
        PreCommit["Pre-Commit<br/>lint-staged"]
        CommitMsg["Commit-Msg<br/>commitlint"]
        PrePush["Pre-Push<br/>typecheck + test"]
    end

    subgraph CI["GitHub Actions CI"]
        Lint["Oxlint"]
        Format["Format Check"]
        TypeCheck["TypeScript"]
        UnitTest["Vitest + Coverage"]
        OWASP["OWASP Dep Check"]
        Sonar["SonarCloud"]
    end

    subgraph Deploy["Deployment"]
        Staging["Staging<br/>develop.koperasi-kegelapan-app.pages.dev"]
        Prod["Production<br/>ahmadmuzaki.my.id"]
    end

    Code --> PreCommit --> CommitMsg --> PrePush
    PrePush -->|"git push"| Lint
    Lint --> Format --> TypeCheck --> UnitTest
    UnitTest -->|"pass"| Staging
    Staging -->|"v* tag"| Prod
    UnitTest --> OWASP --> Sonar
```

---

## Pre-Commit Hook

**Trigger:** `git commit` (via Husky)
**Action:** Runs `lint-staged`

```json
// package.json → lint-staged
{
  "*.{ts,tsx,js,jsx}": ["oxlint --fix", "oxfmt"],
  "*.{json,md,css,html,yaml,toml}": ["oxfmt"]
}
```

### What it does:

1. **Oxlint** - Fast Rust-based linter with auto-fix
   - Plugins: `react`, `typescript`, `unicorn`
   - Key rules enforced:
     - `no-unused-vars` (error)
     - `typescript/consistent-type-imports` (error)
     - `typescript/no-unused-vars` (error)
     - `react/rules-of-hooks` (error)
     - `react/no-array-index-key` (warn)
2. **Oxfmt** - Rust-based formatter (Prettier-compatible)
   - No semicolons, single quotes, 2-space indent, trailing comma (ES5), 100 char width

### Flow:

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Git as Git
    participant Husky as Husky
    participant LS as lint-staged

    Dev->>Git: git commit -m "feat: ..."
    Git->>Husky: pre-commit hook
    Husky->>LS: pnpm lint-staged
    LS->>LS: Filter staged files by pattern
    LS->>LS: Run oxlint --fix on *.ts,*.tsx
    LS->>LS: Run oxfmt on all matched files
    alt Lint errors (unfixable)
        LS-->>Git: EXIT 1 - commit blocked
    else All pass
        LS-->>Git: EXIT 0 - commit proceeds
    end
```

---

## Commit Message Lint (Commitlint)

**Trigger:** `git commit` (commit-msg hook via Husky)
**Action:** Validates commit message format

### Configuration

```javascript
// commitlint.config.js
export default {
  extends: ["@commitlint/config-conventional"],
};
```

### Conventional Commits Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Allowed Types

| Type       | Description                                           |
| ---------- | ----------------------------------------------------- |
| `feat`     | New feature                                           |
| `fix`      | Bug fix                                               |
| `docs`     | Documentation only                                    |
| `style`    | Formatting, no code change                            |
| `refactor` | Code change that neither fixes a bug nor adds feature |
| `perf`     | Performance improvement                               |
| `test`     | Adding or correcting tests                            |
| `build`    | Build system or external dependencies                 |
| `ci`       | CI configuration                                      |
| `chore`    | Other changes (no src or test)                        |
| `revert`   | Reverts a previous commit                             |

### Examples

```bash
# ✅ Valid
feat(nfc): add A/B buffer swap on card write
fix(auth): handle expired refresh token gracefully
docs: update security architecture diagram
test(crypto): add property-based tests for HMAC

# ❌ Invalid
added new feature          # no type prefix
feat: Add new feature      # uppercase subject
feat(nfc) add buffer swap  # missing colon
```

### Flow:

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Git as Git
    participant Husky as Husky
    participant CL as commitlint

    Dev->>Git: git commit -m "feat(nfc): add buffer swap"
    Git->>Husky: commit-msg hook
    Husky->>CL: pnpm commitlint --edit $1
    CL->>CL: Parse message against conventional-commits rules
    alt Invalid format
        CL-->>Git: EXIT 1 - commit rejected
        Note over Dev: Error: subject must not be empty, type must be one of [...]
    else Valid format
        CL-->>Git: EXIT 0 - commit saved
    end
```

---

## Pre-Push Hook

**Trigger:** `git push` (via Husky)
**Action:** Runs typecheck + full test suite

```bash
# .husky/pre-push
pnpm typecheck
pnpm test
```

### What it does:

1. **TypeScript type checking** (`tsc --noEmit`)
   - Full project type validation without emitting files
   - Catches type errors that oxlint doesn't cover
2. **Vitest test suite** (`vitest run`)
   - Runs all unit tests (non-watch mode)
   - Includes property-based tests (fast-check)
   - Must pass 100% before code reaches remote

### Flow:

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Git as Git
    participant Husky as Husky
    participant TSC as TypeScript
    participant Vitest as Vitest

    Dev->>Git: git push origin feature/xyz
    Git->>Husky: pre-push hook
    Husky->>TSC: pnpm typecheck (tsc --noEmit)
    alt Type errors found
        TSC-->>Git: EXIT 1 - push blocked
    else Types OK
        TSC-->>Husky: EXIT 0
        Husky->>Vitest: pnpm test (vitest run)
        alt Tests fail
            Vitest-->>Git: EXIT 1 - push blocked
        else All tests pass
            Vitest-->>Git: EXIT 0 - push proceeds
        end
    end
```

---

## CI Pipeline (GitHub Actions)

### ci-test.yml

Triggered on: push to `master`/`develop`, PRs to `master`

```mermaid
graph TD
    subgraph Parallel["Parallel Jobs"]
        Lint["Lint Job<br/>oxlint + format:check"]
        TC["Typecheck Job<br/>tsc --noEmit"]
        UT["Unit Test Job<br/>vitest run --coverage"]
    end

    Push["Push / PR"] --> Parallel
    UT -->|"Upload"| Coverage["Coverage Artifact<br/>(7 days retention)"]
```

| Job         | Steps                                  |
| ----------- | -------------------------------------- |
| `lint`      | `pnpm lint` + `pnpm format:check`      |
| `typecheck` | `pnpm typecheck`                       |
| `unit-test` | `pnpm test:coverage` + upload artifact |

### static-analysis.yml

Triggered on: push/PR to `master`, weekly Monday 03:00 UTC

```mermaid
graph TD
    Trigger["Push/PR/Schedule"] --> Audit["npm audit<br/>(high severity)"]
    Trigger --> OWASP["OWASP Dependency Check<br/>(HTML report)"]
    Audit --> Sonar["SonarCloud Scan<br/>(with coverage)"]
```

| Job                      | Purpose                                   |
| ------------------------ | ----------------------------------------- |
| `npm-audit`              | Fast vulnerability scan (high+ severity)  |
| `owasp-dependency-check` | Full OWASP CVE database check             |
| `sonarcloud`             | Code quality, coverage, security hotspots |

### deploy.yml

Triggered on: `develop` push (staging), `v*` tags (production), manual dispatch

```mermaid
graph LR
    CI["CI Gate<br/>(ci-test.yml)"] -->|"pass"| S["Deploy Staging<br/>Pages + API Worker"]
    CI -->|"pass + v* tag"| P["Deploy Production<br/>Pages + API Worker"]
```

---

## Tool Summary

| Tool                 | Purpose                    | Stage          |
| -------------------- | -------------------------- | -------------- |
| **Oxlint**           | Linting (Rust, fast)       | Pre-commit, CI |
| **Oxfmt**            | Formatting (Rust, fast)    | Pre-commit, CI |
| **Commitlint**       | Commit message validation  | Commit-msg     |
| **TypeScript (tsc)** | Type checking              | Pre-push, CI   |
| **Vitest**           | Unit + property tests      | Pre-push, CI   |
| **fast-check**       | Property-based testing     | Pre-push, CI   |
| **Playwright**       | E2E browser tests          | CI             |
| **SonarCloud**       | Static analysis + coverage | CI (weekly)    |
| **OWASP Dep Check**  | Vulnerability scanning     | CI (weekly)    |
| **Husky**            | Git hook management        | Local          |
| **lint-staged**      | Staged-file-only linting   | Pre-commit     |
