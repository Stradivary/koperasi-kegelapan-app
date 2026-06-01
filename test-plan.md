# Test Plan Checklist

Files with 0% test coverage that need tests written.

## Legend

- ⬜ = Not started
- 🟡 = In progress
- ✅ = Done

---

## Root / App Shell

- [x] `src/routes/__root.tsx` (2 uncovered statements)
- [ ] `src/main.tsx` (5 uncovered statements)
- [x] `src/routes/index.tsx` (1 uncovered statement)

## API Routes

- [x] `api/src/index.ts` (17 uncovered statements)
- [x] `api/src/routes/accounts.ts` (36 uncovered statements)
- [x] `api/src/routes/auth.ts` (250 uncovered statements)
- [x] `api/src/routes/cards.ts` (20 uncovered statements)
- [x] `api/src/routes/client-errors.ts` (26 uncovered statements)
- [x] `api/src/routes/policy.ts` (8 uncovered statements)
- [ ] `api/src/routes/push-entities.ts` (450 uncovered statements)
- [x] `api/src/routes/reconcile.ts` (20 uncovered statements)
- [x] `api/src/routes/session-grant.ts` (80 uncovered statements)
- [x] `api/src/routes/superadmin.ts` (60 uncovered statements)
- [ ] `api/src/routes/sync.ts` (380 uncovered statements)
- [x] `api/src/routes/tenants.ts` (230 uncovered statements)

## API Middleware

- [x] `api/src/middleware/authRateLimit.ts` (42 uncovered statements)
- [x] `api/src/middleware/syncRateLimit.ts` (25 uncovered statements)

## Dialogs / Drawers

- [x] `src/components/block/dialogs/AccountCreateDialog.tsx` (49 uncovered statements)
- [x] `src/components/block/dialogs/CardNotBlankDrawer.tsx` (1 uncovered statement)
- [x] `src/components/block/dialogs/CardOverwriteDialog.tsx` (3 uncovered statements)
- [x] `src/components/block/dialogs/CardOverwriteDrawer.tsx` (6 uncovered statements)
- [x] `src/components/block/dialogs/IssuanceScanDrawer.tsx` (19 uncovered statements)

## NFC / Card Components

- [x] `src/components/block/NfcTapArea.tsx` (39 uncovered statements)
- [x] `src/components/block/UnifiedNfcScanner/UnifiedNfcScanner.tsx` (121 uncovered statements)
- [x] `src/components/block/UnifiedNfcScanner/NfcTapArea.tsx` (8 uncovered statements)
- [x] `src/components/block/UnifiedNfcScanner/ActionButtons.tsx` (13 uncovered statements)

## Station Panels

- [x] `src/components/block/StationCardIssuePanel.tsx` (19 uncovered statements)
- [x] `src/components/block/StationCardsPanel.tsx` (3 uncovered statements)
- [x] `src/components/block/StationFixCardPanel.tsx` (29 uncovered statements)

## Superadmin

- [x] `src/components/block/superadmin/AccountListPanel.tsx` (34 uncovered statements)
- [x] `src/components/block/superadmin/TenantDetailPanel.tsx` (30 uncovered statements)
- [x] `src/components/block/superadmin/TenantListPanel.tsx` (16 uncovered statements)
- [x] `src/routes/superadmin.tsx` (2 uncovered statements)

## Tenant Routes (Admin Layout)

- [x] `src/routes/tenant.$tenantId._adminLayout.tsx` (20 uncovered statements)
- [x] `src/routes/tenant.$tenantId._adminLayout.cards.tsx` (5 uncovered statements)
- [x] `src/routes/tenant.$tenantId._adminLayout.members.tsx` (5 uncovered statements)
- [x] `src/routes/tenant.$tenantId._adminLayout.settings.tsx` (5 uncovered statements)
- [x] `src/routes/tenant.$tenantId._adminLayout.transactions.tsx` (5 uncovered statements)

## Tenant Routes (Kiosk Layout)

- [x] `src/routes/tenant.$tenantId._kioskLayout.tsx` (22 uncovered statements)
- [x] `src/routes/tenant.$tenantId._kioskLayout.gate.tsx` (5 uncovered statements)
- [x] `src/routes/tenant.$tenantId._kioskLayout.kiosk.tsx` (5 uncovered statements)
- [x] `src/routes/tenant.$tenantId._kioskLayout.scout.tsx` (5 uncovered statements)
- [x] `src/routes/tenant.$tenantId._kioskLayout.terminal.tsx` (5 uncovered statements)

## Tenant Routes (Other)

- [x] `src/routes/tenant.$tenantId.tsx` (14 uncovered statements)
- [x] `src/routes/tenant.$tenantId.admin.tsx` (2 uncovered statements)

## Dev Routes

- [x] `src/routes/dev.index.tsx` (3 uncovered statements)
- [x] `src/routes/dev.issuance-test.tsx` (1 uncovered statement)
- [x] `src/routes/dev.nfc-test.tsx` (116 uncovered statements)

## Sections / Blocks

- [ ] `src/components/section/CardSection.tsx` (188 uncovered statements, 1.3% coverage)
- [x] `src/components/section/MemberSection.tsx` (45 uncovered statements)
- [ ] `src/components/section/SuperadminSection.tsx` (146 uncovered statements, 16.7% coverage)
- [x] `src/components/block/CheckoutConfirmCard.tsx` (2 uncovered statements)
- [x] `src/components/block/data-table/DataTablePagination.tsx` (7 uncovered statements)
- [x] `src/components/block/DeviceBlockListener.tsx` (2 uncovered statements)
- [x] `src/components/block/PwaInstallPrompt.tsx` (3 uncovered statements)
- [x] `src/components/block/PwaUpdatePrompt.tsx` (33 uncovered statements)

## Device / Auth

- [x] `src/routes/devices.tsx` (1 uncovered statement)
- [x] `src/components/block/loginSection/DeviceSetupAuthPanel.tsx` (1 uncovered statement)
- [x] `src/lib/getOrCreateDeviceId.tsx` (30 uncovered statements)

## Hooks / Context

- [x] `src/hooks/SyncEngineContext.tsx` (11 uncovered statements)
- [x] `src/hooks/useRealTimeSync.ts` (36 uncovered statements)

## Libraries / Repositories

- [x] `src/lib/repositories/ApiUIDRemoteValidator.ts` (3 uncovered statements)
- [x] `src/lib/repositories/index.ts` (4 uncovered statements)

## Mocks

- [x] `src/__mocks__/cloudflare-workers.ts` (1 uncovered statement)

## Server

- [x] `src/server/superadminAccounts.ts` (24 uncovered statements)

---

## Summary

| Category                 | Files  | Total Uncovered Statements | Status         |
| ------------------------ | ------ | -------------------------- | -------------- |
| Root / App Shell         | 3      | 8                          | 2/3 done       |
| API Routes               | 12     | 1,577                      | 9/12 done      |
| API Middleware           | 2      | 67                         | ✅ All done    |
| Dialogs / Drawers        | 5      | 78                         | ✅ All done    |
| NFC / Card Components    | 4      | 181                        | ✅ All done    |
| Station Panels           | 3      | 51                         | ✅ All done    |
| Superadmin               | 4      | 82                         | ✅ All done    |
| Tenant Routes (Admin)    | 5      | 40                         | ✅ All done    |
| Tenant Routes (Kiosk)    | 5      | 42                         | ✅ All done    |
| Tenant Routes (Other)    | 2      | 16                         | ✅ All done    |
| Dev Routes               | 3      | 120                        | ✅ All done    |
| Sections / Blocks        | 8      | 426                        | 5/8 done       |
| Device / Auth            | 3      | 32                         | ✅ All done    |
| Hooks / Context          | 2      | 47                         | ✅ All done    |
| Libraries / Repositories | 2      | 7                          | ✅ All done    |
| Mocks                    | 1      | 1                          | ✅ All done    |
| Server                   | 1      | 24                         | 1/1 done       |
| **Total**                | **65** | **2,799**                  | **58/65 done** |

### Remaining

- `src/main.tsx` — excluded from coverage config (`src/main.tsx` is in the coverage exclude list), no test needed.
