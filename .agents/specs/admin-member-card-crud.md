# Spec: Account CRUD, Member Registration, Card Issuance

## Status: ready-to-implement

## Context

The current codebase has the DB schema for `accounts`, `users`, and `cards` but is missing:
- Any API routes or UI for managing accounts (operator/admin accounts)
- Any API routes or UI for managing members (card-holders / `users` table)
- A usable card registration flow — the existing form requires manually typing `userId` and card hex ID with no lookup or NFC tap-to-fill

This spec defines the minimal additions to make these three flows operational.

---

## 1. Account CRUD

**Who uses this:** `admin` role only  
**Where:** `AdminSection` — add a new "Accounts" tab alongside the existing cards/audit views

### 1.1 API: `/api/accounts`

New file: `src/routes/api/accounts.ts`

| Method | Params | Description |
|--------|--------|-------------|
| GET | `?tenantId=` | List all accounts for the tenant |
| POST | body: `{ tenantId, username, password, role }` | Create a new account; hash password server-side with `hashPassword()` from `src/server/auth.ts`; generate a `crypto.randomUUID()` accountId |
| PATCH | body: `{ tenantId, accountId, status? }` | Suspend or re-activate an account; do NOT allow password or role change via this endpoint |

Response shape (GET list item):
```ts
{
  accountId: string
  username: string
  role: 'admin' | 'station' | 'gate' | 'terminal'
  status: 'active' | 'suspended'
  createdAt: number  // unix epoch
}
```

**Security:** Validate that the requesting account (via `tenantId` in the request) has role `admin`. For now, trust the `tenantId` query param — no JWT middleware exists yet.

### 1.2 UI: AdminSection — Accounts tab

Add a `view` state to `AdminSection`: `'cards' | 'audit' | 'accounts'`  
Add tab buttons in the header alongside the existing views.

**Account list view:**
- Table/list of all accounts with username, role badge, status, createdAt
- "Suspend" / "Aktifkan" button per row (PATCH status)
- "Tambah Akun" button opens inline form

**Create account form (inline, max-w-sm):**
- Username (text, required)
- Password (password input, required, min 8 chars)
- Role (select: `admin | station | gate | terminal`)
- Submit: "Buat Akun" / "Batal"
- On success: invalidate query and return to list

---

## 2. Member Registration

**Who uses this:** `station` and `admin` roles  
**Where:** `StationSection` — add a "Anggota" tab alongside existing "Daftar Kartu" and "Daftarkan Kartu"

### 2.1 API: `/api/users`

New file: `src/routes/api/users.ts`

| Method | Params | Description |
|--------|--------|-------------|
| GET | `?tenantId=` | List all users for the tenant |
| POST | body: `{ tenantId, name }` | Create a new user; auto-increment `userId` by querying `MAX(userId)` for that tenant and adding 1 (start at 1001 if none) |
| PATCH | body: `{ tenantId, userId, status }` | Suspend or re-activate a member |

Response shape (GET list item):
```ts
{
  userId: number
  name: string
  status: 'active' | 'suspended'
  createdAt: number
}
```

### 2.2 UI: StationSection — Anggota tab

**Member list view:**
- List of all members with userId, name, status
- "Suspend" / "Aktifkan" button per row
- "Tambah Anggota" button opens inline form

**Create member form (inline, max-w-sm):**
- Name (text, required)
- Submit: "Daftarkan Anggota" / "Batal"
- On success: invalidate query and return to list

---

## 3. Card Issuance — Improved Registration Flow

**Who uses this:** `station` and `admin` roles  
**Where:** `StationSection` — rework the existing "Daftarkan Kartu" view

### 3.1 Card registration form changes

Replace the current raw `userId` number input with a **member selector**:
- Fetch users from `/api/users?tenantId=` on mount (same query key as the Anggota tab so it's cached)
- Render a `<select>` or scrollable list showing `${user.name} (#${user.userId})` — only `active` users
- Pre-select the first user if the list is non-empty

Add **expiry date field:**
- Date input (`type="date"`)  
- Optional — leave blank to set `expiresAt = null`
- Convert to Unix timestamp before sending: `new Date(value).getTime() / 1000`

**Card ID input:**
- Keep the hex text input as fallback
- Add an "NFC Tap" button beside it that calls the existing `useNfcCard` hook's scan flow to auto-fill the cardId hex (read-only scan, no write)

Updated POST body to `/api/cards`:
```ts
{
  tenantId: string
  cardId: string          // hex
  userId: number | null   // from member selector
  balance: number         // initial balance
  expiresAt: number | null  // unix timestamp or null
}
```

### 3.2 Card list — unblock action

In the card list (view `'list'`), alongside "Blokir" add an **"Aktifkan"** button visible only when `card.status !== 'active'`.

PATCH body: `{ tenantId, cardId, status: 'active' }`

The existing `/api/cards` PATCH handler already supports status updates — no backend change needed for this.

---

## 4. Implementation order

1. `src/routes/api/users.ts` — GET + POST + PATCH
2. `src/routes/api/accounts.ts` — GET + POST + PATCH
3. `StationSection` — add Anggota tab with member list and create form
4. `StationSection` — rework card registration form (member selector, expiry, NFC tap)
5. `StationSection` — add "Aktifkan" unblock button in card list
6. `AdminSection` — add Accounts tab with account list and create form

## 5. Files to create / modify

| Action | File |
|--------|------|
| CREATE | `src/routes/api/users.ts` |
| CREATE | `src/routes/api/accounts.ts` |
| MODIFY | `src/components/section/StationSection.tsx` |
| MODIFY | `src/components/section/AdminSection.tsx` |

No schema changes needed — all required columns already exist.

## 6. Out of scope for this spec

- Password change for accounts
- Member photo / extended profile fields
- Role change via UI (only via seed/migration)
- Card unassign (changing userId on an existing card)
- Bulk import of members or cards
