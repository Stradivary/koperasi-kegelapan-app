src/
├── domain/ # Pure business logic (zero framework deps)
│ ├── auth/ # Auth rules, role operations
│ ├── card/ # Card domain (placeholder)
│ ├── crypto/ # Crypto engine
│ ├── member/ # Member domain (placeholder)
│ ├── nfc/ # NFC engine, classifiers, state machine
│ ├── payload/ # Payload encoding/decoding
│ ├── policy/ # Tenant policy rules
│ ├── state-machine/# Generic state machine
│ ├── sync/ # Conflict resolution
│ ├── transaction/ # Transaction domain (placeholder)
│ └── validation/ # Slug, block, print, UID validators
├── application/ # Use cases (orchestration)
│ ├── admin/ # Superadmin use cases
│ ├── auth/ # Session grant, auth session
│ ├── device/ # Device registry
│ ├── ports/ # Interface contracts (placeholder)
│ ├── sync/ # Push, pull, reconcile
│ └── tenant/ # Tenant sync, search
├── infrastructure/ # External adapters
│ ├── api/ # HTTP client, device block, real-time sync
│ ├── device/ # Fingerprint, haptics, device ID
│ ├── error/ # Error tracking
│ ├── persistence/ # Dexie (IndexedDB) + Drizzle (D1)
│ └── sync/ # Peer sync coordinator
├── presentation/ # UI layer
│ ├── components/ # React components
│ ├── hooks/ # React hooks
│ ├── lib/ # UI utilities (cn, formatters, brand)
│ ├── providers/ # TanStack Query provider
│ └── routes/ # TanStack Router routes
├── **mocks**/ # Test mocks
├── assets/ # Static assets
├── main.tsx # App entry
├── routeTree.gen.ts # Auto-generated route tree
├── styles.css # Global styles
└── cloudflare-env.d.ts
