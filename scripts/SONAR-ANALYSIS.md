# Sonar Scan Analysis Guide

`compact-sonar.mjs` shrinks `sonar.scan.json` (432 KB, 180 issues) into small,
focused chunks that fit comfortably in an AI context window without wasting tokens
on noise fields like hashes, UUIDs, timestamps, and metadata.

---

## Quick start

```bash
# Generate all four views at once
node scripts/compact-sonar.mjs                                          # summary
node scripts/compact-sonar.mjs --mode=by-rule     --out=.sonar-compact/by-rule
node scripts/compact-sonar.mjs --mode=by-file     --out=.sonar-compact/by-file
node scripts/compact-sonar.mjs --mode=by-severity --out=.sonar-compact/by-severity
```

Output lands in `.sonar-compact/` (already gitignored - regenerate any time).

---

## Output modes

| Mode          | File(s)                                 | Size       | Best for                                           |
| ------------- | --------------------------------------- | ---------- | -------------------------------------------------- |
| `summary`     | `.sonar-compact/summary.json`           | ~79 KB     | Full picture: stats, top files, all issues grouped |
| `by-rule`     | `.sonar-compact/by-rule/<rule>.json`    | ≤7 KB each | Fix one rule type across the whole codebase        |
| `by-file`     | `.sonar-compact/by-file/<file>.json`    | ≤3 KB each | Fix all issues in a single file                    |
| `by-severity` | `.sonar-compact/by-severity/<sev>.json` | varies     | Triage: tackle CRITICAL → MAJOR → MINOR            |

---

## Recommended AI workflow

### 1. Triage - start here

Feed `summary.json` to get the lay of the land:

```
Analyze .sonar-compact/summary.json and tell me:
- Which files have the most issues?
- Which rules appear most often?
- What should I fix first?
```

### 2. Fix by rule - highest ROI

Each rule file contains every occurrence across the codebase with file + line.
Fix one rule type in a single focused pass.

Top rules by frequency:

| Rule file               | Rule  | Count | What it means                 |
| ----------------------- | ----- | ----- | ----------------------------- |
| `typescript_S3358.json` | S3358 | 27    | Nested ternary operators      |
| `typescript_S6759.json` | S6759 | 23    | Props not marked `Readonly<>` |
| `typescript_S4325.json` | S4325 | 22    | Redundant type assertions     |
| `typescript_S3776.json` | S3776 | 17    | Cognitive complexity too high |
| `typescript_S7735.json` | S7735 | 16    | Array index used as React key |

Example prompt:

```
Here are all occurrences of nested ternaries in the codebase:
#file:.sonar-compact/by-rule/typescript_S3358.json

Fix each one. Prefer early returns or extracted variables over nested ternaries.
```

### 3. Fix by file - clean up a file completely

Each file chunk lists every issue in that file sorted by line number.

```
Fix all sonar issues in this file:
#file:.sonar-compact/by-file/components_layout_AdminLayout_tsx.json
#file:src/components/layout/AdminLayout.tsx
```

### 4. Fix by severity - prioritize CRITICAL

```
Fix all CRITICAL issues:
#file:.sonar-compact/by-severity/critical.json
```

---

## What each compact issue contains

```json
{
  "file": "src/components/layout/AdminLayout.tsx",
  "line": 42,
  "rule": "typescript:S3358",
  "sev": "MAJOR",
  "msg": "Extract this nested ternary operator into an independent statement.",
  "effort": "5min"
}
```

Fields stripped (not useful for fixing): `key`, `hash`, `textRange`, `flows`,
`transitions`, `actions`, `comments`, `organization`, `project`, `internalTags`,
`lastChangeAnalysisUuid`, `lastChangeSource`, `cleanCodeAttribute`,
`cleanCodeAttributeCategory`, `impacts`, `assignee`, `creationDate`, `updateDate`.

---

## CLI options

```
--mode=<summary|by-rule|by-file|by-severity>   default: summary
--input=<path>                                  default: sonar.scan.json
--out=<dir>                                     default: .sonar-compact
```

---

## Re-running after a new scan

```bash
# Pull fresh scan from SonarCloud, then regenerate
node scripts/compact-sonar.mjs --mode=summary
node scripts/compact-sonar.mjs --mode=by-rule --out=.sonar-compact/by-rule
node scripts/compact-sonar.mjs --mode=by-file --out=.sonar-compact/by-file
node scripts/compact-sonar.mjs --mode=by-severity --out=.sonar-compact/by-severity
```
