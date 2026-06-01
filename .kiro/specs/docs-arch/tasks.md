# Implementation Plan: docs-arch

## Overview

Add three sets of Mermaid diagrams to the existing architecture documentation at `.kiro/specs/koperasi-kegelapan-codebase-system-architecture/design.md`: a Clean Architecture Integration Diagram (target/ideal architecture with subgraphs), an Offline Security Architecture section, and an Online Security Architecture section. All changes are documentation-only — inserting Mermaid code blocks at specific locations within the existing document structure.

## Tasks

- [ ] 1. Add Clean Architecture Integration Diagram
  - [ ] 1.1 Insert `### Clean Architecture Integration Diagram` subsection after `### Data Flow Architecture` within the existing `## Architecture` section
    - Add the `graph TD` Mermaid diagram with subgraphs for concentric rings: `DOMAIN` (innermost), `USECASES`, `ADAPTERS`, `OUTER` (outermost)
    - Include all nodes: `CORE`, `SERVER`, `HOOKS`, `GATEWAYS`, `UI`, `EXTAPI` with proper labels and directory mappings
    - Include all dependency arrows pointing inward (UI→HOOKS, EXTAPI→SERVER, HOOKS→SERVER, GATEWAYS→SERVER, HOOKS→CORE, GATEWAYS→CORE, SERVER→CORE)
    - Add a "Purpose" note clarifying this is the TARGET/IDEAL architecture, not the current implementation
    - Wrap in fenced code block with `mermaid` language identifier
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 7.1, 7.3_

- [ ] 2. Add Security Architecture section with Offline Security subsection
  - [ ] 2.1 Insert new `## Security Architecture` H2 section immediately before the existing `## Sequence Diagrams` section
    - Create `### Offline Security` subsection
    - Add `#### Component Overview` with the offline security flowchart (`graph TD`) containing nodes: CARD, GRANT, HKDF, AES, HMAC, CHAIN, BUFFER with labeled relationship arrows
    - Wrap in fenced code block with `mermaid` language identifier
    - _Requirements: 2.1, 2.2, 2.3, 6.2, 7.1, 7.3_

  - [ ] 2.2 Add Offline Security sequence diagram after the flowchart
    - Add `#### Operation Sequence` under `### Offline Security`
    - Insert the `sequenceDiagram` with participants: Terminal, Crypto (Crypto Engine), Card (NFC Card), Grant (Session Grant)
    - Include Card Read Flow (NFC read, key retrieval, HKDF derivation, AES decrypt, HMAC verify, counter bind check, chain hash validation)
    - Include Card Write Flow (state mutation, chain hash recompute, AES encrypt, HMAC compute, buffer swap, NFC write)
    - Wrap in fenced code block with `mermaid` language identifier
    - _Requirements: 3.1, 3.2, 3.3, 7.2, 7.3_

- [ ] 3. Add Online Security subsection within Security Architecture
  - [ ] 3.1 Add `### Online Security` subsection after `### Offline Security`
    - Add `#### Component Overview` with the online security flowchart (`graph TD`) containing nodes: AUTH, JWT, REFRESH, DEVICE, RATE, SYNC, TENANT with labeled relationship arrows
    - Wrap in fenced code block with `mermaid` language identifier
    - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.3_

  - [ ] 3.2 Add Online Security sequence diagram after the flowchart
    - Add `#### Operation Sequence` under `### Online Security`
    - Insert the `sequenceDiagram` with participants: Client, API (API Server), DB (Database), Crypto (Crypto Module)
    - Include Authentication flow (POST /auth/token, PBKDF2 verify, device registration, session creation)
    - Include Token Rotation flow (refresh token hash lookup, rotation on match, session revocation on reuse)
    - Include Rate Limiting & Sync flow (sliding window check, tenant isolation validation, transaction insert)
    - Wrap in fenced code block with `mermaid` language identifier
    - _Requirements: 5.1, 5.2, 5.3, 7.2, 7.3_

- [ ] 4. Checkpoint - Verify document structure and syntax
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Verify section ordering and Mermaid syntax validity
  - [ ] 5.1 Validate correct section ordering in the modified document
    - Confirm heading hierarchy: `## Architecture` → (existing subsections) → `### Clean Architecture Integration Diagram` → `## Security Architecture` → `### Offline Security` → `### Online Security` → `## Sequence Diagrams`
    - Ensure no existing sections were displaced or removed
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 5.2 Validate Mermaid syntax for all inserted diagrams
    - Verify each diagram uses valid `graph TD` or `sequenceDiagram` syntax
    - Confirm all node IDs are unique within their respective diagrams
    - Confirm all arrow labels use valid Mermaid syntax (`-->|"label"|` for flowcharts, `->>` / `-->>` for sequence diagrams)
    - Verify fenced code blocks use `mermaid` language identifier
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 6. Final checkpoint - Ensure all validations pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- This is a documentation-only feature — no runtime code is modified
- All Mermaid content is defined in the design document and should be copied exactly
- The Clean Architecture diagram represents the TARGET/IDEAL architecture, not the current implementation
- No property-based tests are applicable (static content insertion)
- Validation is example-based: check presence of nodes, correct section ordering, and valid Mermaid syntax
- The target file is `.kiro/specs/koperasi-kegelapan-codebase-system-architecture/design.md`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["5.1", "5.2"] }
  ]
}
```
