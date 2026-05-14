# GRAND PLAN: Koperasi Kegelapan — By Telkomsel
### PWA NFC Cooperative Payment System — Feature Implementation Plan
**Date:** 2026-05-14  
**Stack:** TanStack Start + React 19 + Tailwind v4 + Drizzle ORM (SQLite / Cloudflare D1)  
**Status:** DRAFT — Awaiting user approval before any code is written

---

## Baseline State

| Item | Current State |
|------|---------------|
| Fonts | `Fraunces` + `Manrope` via Google Fonts |
| Brand colors | Close but wrong — `#e9002e` vs Signal DS `#FF0025` |
| Manifest | `"Create TanStack App Sample"`, no SW |
| Service Worker | None |
| IndexedDB | v1: tenantContext, cardSnapshot, policyCache, reconciliationOutbox |
| Login | Always calls `/api/auth/token` — hard server dependency |
| Admin layout | Flat section, no sidebar |
| Kiosk views | Basic shadcn unstyled |
| Tenant mode | Always server-connected |

---

## Phase 1 — Brand Foundation & Constants
**Goal:** Single source of truth for all brand text, colors, and font names.  
**Files Created:**
- `src/lib/brand.ts` — All brand constants (no logic, pure data)

**Constants to define:**
```ts
APP_NAME = "Koperasi Kegelapan"
ORG_NAME = "Telkomsel"
TAGLINE = "By Telkomsel"
FULL_BRAND = "Koperasi Kegelapan — By Telkomsel"
SHORT_BRAND = "KK"
APP_VERSION = "1.0.0"

// Fonts
FONT_HEADING = "Telkomsel Batik Sans"
FONT_BODY = "Poppins"

// Brand Colors (Signal Design System)
COLOR_PRIMARY = "#FF0025"         // Brand Red 500
COLOR_SECONDARY = "#001A41"       // Dark Blue 700
COLOR_PRIMARY_BG = "#ED0226"      // Tsel Red Accessible
COLOR_SECONDARY_BG = "#001A41"    // Tsel Dark Blue

// Text Colors
COLOR_TEXT_PRIMARY = "#001A41"
COLOR_TEXT_SECONDARY = "#4E5784"
COLOR_TEXT_DISABLE = "#B3BAC8"
COLOR_TEXT_RED = "#FF0025"
COLOR_TEXT_VALID = "#008E53"
COLOR_TEXT_INFO = "#0050AE"
COLOR_TEXT_ERROR = "#BC1D42"
COLOR_TEXT_WARNING = "#D9801F"

// Background Colors
COLOR_BG_DISABLE = "#F5F8FA"
COLOR_BG_WARM = "#F6F3F3"
COLOR_BG_VALID = "#EDFCF0"
COLOR_BG_INFO = "#E7F5FC"
COLOR_BG_ERROR = "#FDDDD4"
COLOR_BG_WARNING = "#FEF3D4"
```

**Dependencies:** None  
**Risk:** Low — purely additive

---

## Phase 2 — Typography System (Signal Design System)
**Goal:** Replace Fraunces+Manrope with Telkomsel Batik Sans+Poppins per Signal DS spec.  

**Files Modified:**
- `src/styles.css` — Replace `@import` and `--font-*` variables, add type scale classes
- `public/` — Add `fonts/TelkomselBatikSans-Bold.woff2` (font file to be provided or referenced)

**Type Scale (Signal DS):**
| Class | Font | Size | Weight | Line-Height |
|-------|------|------|--------|-------------|
| `.h1` | Telkomsel Batik Sans | 44px | Bold | 56px |
| `.h2` | Telkomsel Batik Sans | 32px | Bold | 48px |
| `.h3` | Telkomsel Batik Sans | 28px | Bold | 40px |
| `.h4` | Telkomsel Batik Sans | 24px | Bold | 40px |
| `.h5` | Telkomsel Batik Sans | 18px | Bold | 24px |
| `.h6` | Telkomsel Batik Sans | 16px | Bold | 24px |
| `.title-bold` | Poppins | 16px | 600 | 24px |
| `.title-regular` | Poppins | 16px | 400 | 24px |
| `.body1-bold` | Poppins | 14px | 600 | 20px |
| `.body1` | Poppins | 14px | 400 | 20px |
| `.body1-caps-bold` | Poppins | 14px | 600 | 20px + uppercase |
| `.body1-caps` | Poppins | 14px | 400 | 20px + uppercase |
| `.body2-bold` | Poppins | 12px | 600 | 20px |
| `.body2` | Poppins | 12px | 400 | 20px |
| `.strike` | Poppins | 12px | 400 + strikethrough | 20px |

**Font loading strategy:**
- Telkomsel Batik Sans: `@font-face` from `public/fonts/` (local, works offline)
- Poppins: Google Fonts with `<link rel="preconnect">` + fallback to `sans-serif`

**Note:** Telkomsel Batik Sans is a proprietary font. Font files must be placed in `public/fonts/`. The plan assumes files will be provided. If not available, plan includes a fallback section.

**Dependencies:** Phase 1 (brand constants)  
**Risk:** Medium — font file availability; Poppins requires internet on first load (cached by SW later)

---

## Phase 3 — Signal Design System Color Tokens
**Goal:** Implement the full Signal DS color palette as CSS variables and Tailwind v4 tokens.

**Files Modified:**
- `src/styles.css` — Replace existing color variables with full Signal DS token set

**Token Structure:**
```css
/* Brand Shades */
--shade-primary-0: #FFF5F6;
--shade-primary-100: #FFFSE9;
--shade-primary-200: #FFCCD5;
--shade-primary-300: #FF99AB;
--shade-primary-400: #FF3361;
--shade-primary-500: #FF0025;  /* Brand Red */
--shade-primary-600: #E50022;
--shade-primary-700: #C2001C;
--shade-primary-800: #940015;
--shade-primary-900: #56000F;

--shade-secondary-0: #FCFDFD;
--shade-secondary-100: #F5F9FA;
/* ... full secondary scale ... */
--shade-secondary-700: #001A41;  /* Dark Blue */
/* ... */

/* Semantic Valid (Green) */
--semantic-valid-0: #C7F9C6; ... --semantic-valid-500: #008888; --semantic-valid-600: #007A53;

/* Semantic Info (Blue) */  
--semantic-info-0: #CBFA; ... --semantic-info-500: #0050AE;

/* Semantic Warning (Amber) */
--semantic-warning-0: #FEFBF7; ... --semantic-warning-500: #FDA25F;

/* Semantic Error (Red) */
--semantic-error-0: #FEF5F8; ... --semantic-error-500: #E98860;

/* Neutral */
--shade-neutral-0: #FFFFFF;
--shade-neutral-100: #FAFAFA;
--shade-neutral-200: #F0F0F0;
--shade-neutral-300: #CCCF00;
--shade-neutral-400: #99A067;
--shade-neutral-500: #607177;  /* text-disable */
--shade-neutral-600: #415764;  /* text-secondary */
```

**Tailwind v4 theme extension** in `src/styles.css` via `@theme`:
```css
@theme {
  --color-brand: var(--shade-primary-500);
  --color-brand-dark: var(--shade-secondary-700);
  --color-brand-bg: #ED0226;
  /* ... full mapping ... */
}
```

**Dependencies:** Phase 1  
**Risk:** Low — CSS variable changes, no logic

---

## Phase 4 — Offline-First PWA (Service Worker + Workbox)
**Goal:** App fully functional after first visit, even with no internet.

**New Dependencies:**
- `vite-plugin-pwa` (Vite integration for Workbox)
- `workbox-*` (auto-installed by vite-plugin-pwa)

**Files Modified:**
- `vite.config.ts` — Add `VitePWA` plugin with Workbox config
- `public/manifest.json` — Update name, colors, description, icons
- `src/routes/__root.tsx` — Add SW registration + update prompt UI

**Files Created:**
- `src/lib/pwa.ts` — SW registration utilities + update notification hook

**Workbox Strategy:**
| Resource Type | Strategy | Config |
|---------------|----------|--------|
| HTML/JS/CSS bundles | `CacheFirst` | Max 30 days |
| Font files (local) | `CacheFirst` | Max 365 days |
| Google Fonts CSS | `StaleWhileRevalidate` | Max 1 year |
| `/api/policy` | `NetworkFirst` | Fallback: IDB cache |
| `/api/cards` | `NetworkFirst` | Fallback: IDB cardSnapshot |
| `/api/reconcile` | Background Sync | Queue: `reconcile-queue` |
| All other API | `NetworkOnly` | (auth must be fresh) |

**Manifest Updates:**
```json
{
  "name": "Koperasi Kegelapan",
  "short_name": "KK Wallet",
  "description": "NFC Cooperative Wallet — By Telkomsel",
  "theme_color": "#FF0025",
  "background_color": "#001A41",
  "display": "standalone",
  "start_url": "/",
  "icons": [...]
}
```

**SW Update Flow:**
- On new SW detected: show non-blocking toast "Update tersedia — Muat Ulang"
- User taps → `skipWaiting()` → reload

**Compatibility Note:** TanStack Start targets Cloudflare Workers (edge SSR). The SW intercepts only client-side navigation. API calls during SSR are unaffected. The `vite-plugin-pwa` `injectRegister: 'auto'` mode works alongside SSR frameworks.

**Dependencies:** Phase 2 (font loading strategy affects caching)  
**Risk:** Medium-High — Cloudflare Workers + PWA interaction needs careful testing; SW only active in browser, SSR routes remain server-side

---

## Phase 5 — Local-Only Mode (Optional Tenant Registration)
**Goal:** App runs fully locally without any server. Server sync is optional (backup/migration/license).

**Architecture Decision:**
```
Current:  Device → Server (always required for login)
New:      Device → IndexedDB (default, offline)
               ↕  (optional, user-initiated)
          Device → Server (sync/backup/license)
```

**Files Modified:**
- `src/lib/indexeddb.ts` — Add `localAccounts` store (v2 migration), `localTenantConfig` store
- `src/routes/index.tsx` — Add local login path + setup wizard trigger
- `src/routes/api/auth/token.ts` — Unchanged (server path still works when online)

**Files Created:**
- `src/lib/localTenant.ts` — Local tenant CRUD + export/import
- `src/components/section/LocalSetupSection.tsx` — First-run local setup wizard
- `src/components/section/TenantExportSection.tsx` — Export/Import UI in admin

**IndexedDB v2 New Stores:**

```ts
// localTenantConfig — replaces server-issued tenant
{
  keyPath: 'tenantId',
  fields: {
    tenantId: string,      // generated UUID
    slug: string,
    name: string,
    timezone: string,
    mode: 'local' | 'synced',  // local = no server, synced = registered
    serverUrl?: string,
    createdAt: number,
    exportedAt?: number
  }
}

// localAccounts — password-based local accounts (no server)
{
  keyPath: 'accountId',
  indexes: ['tenantId', 'username'],
  fields: {
    accountId: string,
    tenantId: string,
    username: string,
    passwordHash: string,  // PBKDF2 in-browser
    role: Role,
    status: 'active' | 'inactive'
  }
}
```

**Login Flow (Updated):**
```
User enters username/password
  → Check: is tenant in 'local' mode?
    YES → Verify against localAccounts IDB store (PBKDF2 in-browser)
    NO  → POST /api/auth/token (server path, unchanged)
  → On success → store tenantContext in IDB → redirect to role view
```

**Local Setup Wizard (first-run):**
1. Choose mode: "Mulai Lokal" vs "Hubungkan ke Server"
2. If local: enter tenant name, admin username/password → stored in IDB
3. If server: existing login flow

**Export/Import (Admin → Settings → Tenant):**
- Export: serialize localTenantConfig + localAccounts + cards + audit log → encrypted JSON
- Encryption: AES-GCM with passphrase-derived key (PBKDF2)
- Import: decrypt JSON → restore to IDB → optionally push to server (migration)
- Use cases: backup, device migration, license transfer to server

**Dependencies:** Phase 4 (SW must cache the app for offline login to work)  
**Risk:** High — login flow change; must preserve server path; PBKDF2 in-browser consistency with server hash format

---

## Phase 6 — Admin Layout (Desktop Sidebar)
**Goal:** Desktop-first admin experience with collapsible sidebar navigation.

**Files Created:**
- `src/components/layout/AdminLayout.tsx` — Main layout with sidebar
- `src/components/layout/AdminSidebar.tsx` — Nav items + collapse logic
- `src/components/layout/AdminHeader.tsx` — Top bar with tenant/user info

**Files Modified:**
- `src/components/section/AdminSection.tsx` — Wrap in new AdminLayout
- `src/routes/tenant.$tenantId.admin.tsx` — Pass layout context

**Sidebar Structure:**
```
[Logo + "Koperasi Kegelapan"]
[Tenant name chip]
────────────────────────────
📊 Dashboard
💳 Kartu (Cards)
👤 Pengguna (Users)  
📋 Transaksi
🔄 Rekonsiliasi
────────────────────────────
⚙️  Pengaturan
📤 Export / Backup
────────────────────────────
[User avatar + name]
[Logout button]
```

**Responsive Behavior:**
| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥1024px) | Sidebar fixed 240px, content fills remaining |
| Tablet (768–1023px) | Sidebar collapsed to 64px icons-only, hover expands |
| Mobile (<768px) | Sidebar hidden, bottom navigation bar (4 key items) |

**Dependencies:** Phase 3 (colors), Phase 2 (typography)  
**Risk:** Low-Medium — layout restructure, no business logic change

---

## Phase 7 — Kiosk Views (Signal Design System)
**Goal:** All operator/kiosk views (kiosk, gate, terminal, scout, station) adopt Signal DS visual language.

**Files Created:**
- `src/components/layout/KioskLayout.tsx` — Full-screen mobile layout shell
- `src/components/block/NfcTapArea.tsx` — Animated NFC tap circle
- `src/components/block/AmountDisplay.tsx` — Large currency display
- `src/components/block/StatusSheet.tsx` — Bottom-sheet success/error/loading

**Files Modified:**
- `src/components/section/KioskSection.tsx`
- `src/components/section/GateSection.tsx`
- `src/components/section/TerminalSection.tsx`
- `src/components/section/ScoutSection.tsx`
- `src/components/section/StationSection.tsx`

**KioskLayout Structure:**
```
┌─────────────────────────────┐
│  [Header: Logo + App Name]  │  bg: #FF0025, text: white
│  "Koperasi Kegelapan"       │  Telkomsel Batik Sans Bold
│  By Telkomsel               │  Poppins 12px
├─────────────────────────────┤
│                             │
│    [View-specific content]  │  bg: white
│                             │
│    [NFC Tap Area]           │  Animated ring, 200px circle
│    "Tempel Kartu"           │  Poppins, centered
│                             │
├─────────────────────────────┤
│  [Status / Action area]     │  bg: #F5F8FA
└─────────────────────────────┘
```

**NFC Tap Area Animation:**
- Idle: slow pulse ring (3s ease-in-out infinite)
- Reading: fast spin ring (#FF0025)
- Success: green fill + checkmark (#008E53)
- Error: red flash (#BC1D42) + shake

**Per-view specifics:**

| View | Primary Action | Color Accent |
|------|----------------|--------------|
| Terminal | Debit (bayar) | Red primary |
| Gate | Checkin/Checkout | Dark Blue |
| Kiosk | Top-up credit | Valid Green |
| Scout | Balance check | Info Blue |
| Station | Credit + admin | Dark Blue |

**Dependencies:** Phases 1-3 (brand + colors + fonts must be in place)  
**Risk:** Medium — visual overhaul of core operator views; NFC interaction states must be preserved

---

## Phase 8 — Polish & Integration
**Goal:** Tie all phases together, update root layout, finalize branding.

**Files Modified:**
- `src/routes/__root.tsx` — Brand head tags, SW registration, font preloads
- `src/routes/index.tsx` — Apply Signal DS to login page
- `src/components/block/OfflineIndicator.tsx` — Brand-consistent offline banner
- `src/components/block/TransactionList.tsx` — Apply new type tokens

**Files Created:**
- `src/components/block/UpdatePrompt.tsx` — SW update notification toast

**Deliverables:**
- Login page: full Signal DS branding with Telkomsel colors
- Offline indicator: red banner with proper typography
- SW update prompt: bottom toast
- All `document.title` uses brand constant
- All hardcoded color/name strings replaced with brand constants

**Dependencies:** All previous phases  
**Risk:** Low — integration and cleanup

---

## Implementation Order & Rationale

```
Phase 1 (brand.ts)
  ↓
Phase 2 (typography) ── Phase 3 (colors)
  ↓                           ↓
Phase 4 (PWA/SW) ─────────────┤
  ↓                           │
Phase 5 (local mode)          │
  ↓                           ↓
Phase 6 (admin layout) ── Phase 7 (kiosk views)
                              ↓
                         Phase 8 (polish)
```

Phases 2+3 can proceed in parallel. Phase 4 must precede Phase 5 (SW needed for offline login). Phases 6+7 can proceed in parallel after Phase 3.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Telkomsel Batik Sans font files unavailable | High | Medium | Fallback: use `Inter` with similar metrics; add TODO marker |
| vite-plugin-pwa + Cloudflare Workers conflict | Medium | High | Test in dev mode first; consider manual SW if plugin fails |
| IndexedDB v1→v2 migration breaks existing sessions | Medium | High | Always write `onupgradeneeded` with version guard; test migration path |
| Local PBKDF2 hash incompatible with server hash | Medium | High | Use identical params (310,000 iterations, SHA-256, same salt format) |
| Signal DS colors break existing shadcn components | Low | Medium | Map old CSS vars to new Signal vars; test each component |

---

## Questions for User Before Proceeding

1. **Telkomsel Batik Sans font files** — Do you have the `.woff2`/`.ttf` files? Or should we reference a CDN URL?
2. **Local mode account storage** — Should local passwords use the same PBKDF2 parameters as the server, so accounts can be migrated server-side later?
3. **Export encryption** — What passphrase strategy for export? User-defined passphrase, or auto-derive from admin password?
4. **Cloudflare Workers target** — Should PWA SW work in CF Workers preview, or only production browser?
5. **Phase priority** — Any phase you want to skip or defer? Suggested order: 1→2→3→4→6→7→5→8 (local mode last as it's highest risk).
