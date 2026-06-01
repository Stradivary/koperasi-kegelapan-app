# Requirements Document

## Introduction

Update the existing architecture documentation at `.kiro/specs/koperasi-kegelapan-codebase-system-architecture/design.md` with three new Mermaid diagrams: a Clean Architecture Integration Diagram showing dependency direction between layers, an Offline Security Diagram combining flowchart overview and sequence diagram for offline cryptographic operations, and an Online Security Diagram combining flowchart overview and sequence diagram for server-side authentication and security flows.

## Glossary

- **Design_Document**: The existing architecture documentation file located at `.kiro/specs/koperasi-kegelapan-codebase-system-architecture/design.md`
- **Clean_Architecture_Diagram**: A Mermaid flowchart showing dependency direction between application layers as boxes with arrows, without listing individual module names within each layer
- **Offline_Security_Diagram**: A combination of Mermaid flowchart (component overview) and sequence diagram depicting offline cryptographic operations including encryption, HMAC verification, chain hash integrity, and A/B buffer protection
- **Online_Security_Diagram**: A combination of Mermaid flowchart (component overview) and sequence diagram depicting server-side security flows including authentication, token rotation, device binding, rate limiting, sync validation, and tenant isolation
- **Architecture_Section**: The existing `## Architecture` top-level section in the Design_Document
- **Security_Architecture_Section**: A new `## Security Architecture` top-level section to be added after the Architecture_Section

## Requirements

### Requirement 1: Clean Architecture Integration Diagram

**User Story:** As a developer, I want a clean architecture diagram showing dependency direction between layers, so that I can understand the high-level dependency flow without being overwhelmed by individual module details.

#### Acceptance Criteria

1. WHEN the Design_Document is rendered, THE Clean_Architecture_Diagram SHALL display a Mermaid flowchart with exactly eight layer boxes: Domain/Business Logic (`src/core/`), Application Layer (`src/hooks/`), Presentation Layer (`src/components/`), Infrastructure/Utilities (`src/lib/`), Server-side Services (`src/server/`), Data Layer (`src/db/`), Route Definitions (`src/routes/`), and Backend API (`api/src/`).
2. THE Clean_Architecture_Diagram SHALL show dependency direction using arrows pointing from dependent layer to dependency (inward toward domain).
3. THE Clean_Architecture_Diagram SHALL represent each layer as a single labeled box without listing individual module names within the box.
4. THE Clean_Architecture_Diagram SHALL be placed within the existing Architecture_Section of the Design_Document.

### Requirement 2: Offline Security Flowchart Overview

**User Story:** As a developer, I want a flowchart overview of the offline security architecture, so that I can understand how cryptographic components relate to each other at a glance.

#### Acceptance Criteria

1. WHEN the Design_Document is rendered, THE Offline_Security_Diagram flowchart SHALL display components for: card-as-source-of-truth, session grant cache, AES-256-GCM encrypt/decrypt, HKDF key derivation, truncated 8-byte HMAC-SHA256 verification, SHA-256 chain hash integrity (truncated to 6 bytes), and A/B dual buffer with active pointer for crash recovery.
2. THE Offline_Security_Diagram flowchart SHALL show relationships and data flow between the offline security components using labeled arrows.
3. THE Offline_Security_Diagram flowchart SHALL be placed within the Security_Architecture_Section of the Design_Document.

### Requirement 3: Offline Security Sequence Diagram

**User Story:** As a developer, I want a sequence diagram showing the step-by-step offline security flows, so that I can trace the exact order of cryptographic operations during card read/write.

#### Acceptance Criteria

1. WHEN the Design_Document is rendered, THE Offline_Security_Diagram sequence diagram SHALL depict the step-by-step flow for: HKDF key derivation from session key, AES-256-GCM encryption and decryption of card body, HMAC-SHA256 computation and verification (truncated to 8 bytes), SHA-256 chain hash computation linking log entries (truncated to 6 bytes), and A/B buffer selection with active pointer swap on write.
2. THE Offline_Security_Diagram sequence diagram SHALL identify participants including the Terminal, Crypto Engine, NFC Card, and Session Grant.
3. THE Offline_Security_Diagram sequence diagram SHALL be placed within the Security_Architecture_Section immediately after the offline security flowchart.

### Requirement 4: Online Security Flowchart Overview

**User Story:** As a developer, I want a flowchart overview of the online security architecture, so that I can understand how server-side security components interact.

#### Acceptance Criteria

1. WHEN the Design_Document is rendered, THE Online_Security_Diagram flowchart SHALL display components for: PBKDF2-SHA256 password verification, JWT access token issuance, refresh token rotation with hash storage and reuse detection, device fingerprint binding with device registry, rate limiting (60 req/min sliding window per device), sync push/pull with server validation, and tenant isolation via composite keys and scoped queries.
2. THE Online_Security_Diagram flowchart SHALL show relationships and data flow between the online security components using labeled arrows.
3. THE Online_Security_Diagram flowchart SHALL be placed within the Security_Architecture_Section of the Design_Document.

### Requirement 5: Online Security Sequence Diagram

**User Story:** As a developer, I want a sequence diagram showing the step-by-step online security flows, so that I can trace authentication, token lifecycle, and sync validation operations.

#### Acceptance Criteria

1. WHEN the Design_Document is rendered, THE Online_Security_Diagram sequence diagram SHALL depict the step-by-step flow for: authentication (PBKDF2-SHA256 password verification leading to JWT access token), token rotation (refresh token rotation with SHA-256 hash storage and reuse detection triggering session revocation), device binding (fingerprint hash registration in device registry), rate limiting enforcement (60 req/min sliding window per device), and sync push/pull with server-side validation.
2. THE Online_Security_Diagram sequence diagram SHALL identify participants including the Client, API Server, Database, and Crypto module.
3. THE Online_Security_Diagram sequence diagram SHALL be placed within the Security_Architecture_Section immediately after the online security flowchart.

### Requirement 6: Section Placement

**User Story:** As a developer, I want the diagrams placed in predictable locations within the document, so that the documentation structure remains organized and navigable.

#### Acceptance Criteria

1. THE Design_Document SHALL contain the Clean_Architecture_Diagram within the existing Architecture_Section.
2. THE Design_Document SHALL contain a new Security_Architecture_Section placed immediately after the Architecture_Section and before the existing `## Sequence Diagrams` section.
3. THE Security_Architecture_Section SHALL contain subsections for offline security (flowchart followed by sequence diagram) and online security (flowchart followed by sequence diagram).

### Requirement 7: Diagram Format Consistency

**User Story:** As a developer, I want all new diagrams to use consistent Mermaid syntax and formatting, so that they render correctly and match the existing documentation style.

#### Acceptance Criteria

1. THE Design_Document SHALL use valid Mermaid `graph TD` or `graph LR` syntax for all new flowchart diagrams.
2. THE Design_Document SHALL use valid Mermaid `sequenceDiagram` syntax for all new sequence diagrams.
3. THE Design_Document SHALL wrap each new diagram in a fenced code block with the `mermaid` language identifier.
4. THE Design_Document SHALL use descriptive node labels and arrow labels consistent with the terminology defined in the Glossary of the existing Design_Document.
