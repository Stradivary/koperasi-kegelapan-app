# ============================================================================
# Clean Architecture Migration Script v2
# ============================================================================
# Reorganizes the codebase into a proper Clean Architecture layering:
#
#   src/
#     core/            ← Domain Layer (already exists, expand it)
#     application/     ← Use Cases / Application Services
#     infrastructure/  ← Gateways, Adapters, DB, API client
#     presentation/    ← UI: components, hooks, routes
#
#   api/
#     src/
#       domain/        ← Server-side domain logic
#       application/   ← Server-side use cases
#       infrastructure/← Server middleware, DB access
#       routes/        ← HTTP handlers (keep as-is, they're thin)
#
# Usage:
#   .\scripts\clean-arch.ps1 [-DryRun] [-Phase 1|2|3|4|5|6]
#
# Flags:
#   -DryRun   Show what would happen without actually moving anything
#   -Phase    Run only a specific phase (1-6). Default: all phases.
#
# Phases:
#   1 — Consolidate Domain Layer (src/core/)
#   2 — Extract Application Layer (Use Cases from src/server/)
#   3 — Organize Infrastructure Layer (from src/lib/ + src/db/)
#   4 — Organize Presentation Layer (components/hooks/routes)
#   5 — Organize API Backend (api/src/)
#   6 — Rewrite Imports & Emit Manifest
#
# IMPORTANT: Run from project root. Commit your work first!
# ============================================================================

param(
    [switch]$DryRun,
    [int]$Phase = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot | Split-Path -Parent
$SrcRoot = Join-Path $ProjectRoot "src"
$ApiRoot = Join-Path $ProjectRoot "api\src"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step($msg) {
    Write-Host "  -> $msg" -ForegroundColor Cyan
}

function Write-Phase($num, $title) {
    Write-Host "`n===============================================================" -ForegroundColor Yellow
    Write-Host "  PHASE ${num}: ${title}" -ForegroundColor Yellow
    Write-Host "===============================================================" -ForegroundColor Yellow
}

function Write-Skip($msg) {
    Write-Host "  [SKIP] $msg" -ForegroundColor DarkGray
}

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        if ($DryRun) {
            Write-Host "  [DRY] mkdir $path" -ForegroundColor DarkYellow
        } else {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }
}

function Safe-Move($source, $dest, $reExportFrom) {
    $sourceRel = $source.Replace($ProjectRoot, "").TrimStart("\", "/")
    $destRel = $dest.Replace($ProjectRoot, "").TrimStart("\", "/")

    if (-not (Test-Path $source)) {
        Write-Skip "$sourceRel does not exist"
        return
    }

    if (Test-Path $dest) {
        Write-Skip "$destRel already exists (already migrated?)"
        return
    }

    $destDir = Split-Path $dest -Parent
    Ensure-Dir $destDir

    if ($DryRun) {
        Write-Host "  [DRY] move $sourceRel -> $destRel" -ForegroundColor DarkYellow
        if ($reExportFrom) {
            Write-Host "  [DRY] create re-export at $sourceRel" -ForegroundColor DarkYellow
        }
    } else {
        Move-Item -Path $source -Destination $dest -Force
        Write-Step "moved $sourceRel -> $destRel"

        if ($reExportFrom) {
            $reExportContent = "// Auto-generated re-export - remove after updating all imports`n"
            $reExportContent += "export * from `"$reExportFrom`";`n"
            Set-Content -Path $source -Value $reExportContent -Encoding UTF8
            Write-Step "created re-export at $sourceRel"
        }
    }
}

function Safe-Move-Dir($source, $dest) {
    $sourceRel = $source.Replace($ProjectRoot, "").TrimStart("\", "/")
    $destRel = $dest.Replace($ProjectRoot, "").TrimStart("\", "/")

    if (-not (Test-Path $source)) {
        Write-Skip "$sourceRel does not exist"
        return
    }

    if (Test-Path $dest) {
        Write-Skip "$destRel already exists (already migrated?)"
        return
    }

    $destParent = Split-Path $dest -Parent
    Ensure-Dir $destParent

    if ($DryRun) {
        Write-Host "  [DRY] move dir $sourceRel -> $destRel" -ForegroundColor DarkYellow
    } else {
        Move-Item -Path $source -Destination $dest -Force
        Write-Step "moved dir $sourceRel -> $destRel"
    }
}

function Get-ReExportPath($oldFile, $newFile) {
    $oldDir = Split-Path $oldFile -Parent
    $newFileNoExt = [System.IO.Path]::ChangeExtension($newFile, $null).TrimEnd(".")

    $oldDirUri = New-Object System.Uri("$oldDir\")
    $newFileUri = New-Object System.Uri($newFileNoExt)
    $relativePath = $oldDirUri.MakeRelativeUri($newFileUri).ToString()
    $relativePath = [System.Uri]::UnescapeDataString($relativePath)
    $relativePath = $relativePath.Replace("\", "/")
    if (-not $relativePath.StartsWith(".")) {
        $relativePath = "./$relativePath"
    }
    return $relativePath
}

# ============================================================================
# PHASE 1: Consolidate Domain Layer (src/core/)
# ============================================================================
# The domain layer already has: interfaces, nfc, payload, state-machine,
# validation, crypto. We now add domain logic extracted from src/server/
# and src/lib/ that is pure business rules with no infrastructure deps.
# ============================================================================

function Run-Phase1 {
    Write-Phase 1 "Consolidate Domain Layer (src/core/)"

    # ── core/auth/ — pure auth rules ──
    $coreAuth = Join-Path $SrcRoot "core\auth"
    Ensure-Dir $coreAuth

    $src = Join-Path $SrcRoot "server\auth.ts"
    $dst = Join-Path $coreAuth "authRules.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\roleOps.ts"
    $dst = Join-Path $coreAuth "roleOps.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\policy.ts"
    $dst = Join-Path $coreAuth "policy.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── core/sync/ — pure conflict resolution logic ──
    $coreSync = Join-Path $SrcRoot "core\sync"
    Ensure-Dir $coreSync

    $src = Join-Path $SrcRoot "lib\syncConflictResolver.ts"
    $dst = Join-Path $coreSync "conflictResolver.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── core/validation/ — already exists, add slugValidation ──
    $src = Join-Path $SrcRoot "lib\utils\slugValidation.ts"
    $dst = Join-Path $SrcRoot "core\validation\slugValidation.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── core/types/ — shared domain value objects ──
    # (core/interfaces/ already holds these, leave as-is)

    Write-Host "`n  [OK] Phase 1 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 2: Extract Application Layer (Use Cases)
# ============================================================================
# Orchestration logic from src/server/ that coordinates domain + infra.
# These become use cases under src/application/.
# ============================================================================

function Run-Phase2 {
    Write-Phase 2 "Extract Application Layer (Use Cases)"

    # ── application/sync/ ──
    $appSync = Join-Path $SrcRoot "application\sync"
    Ensure-Dir $appSync

    $src = Join-Path $SrcRoot "lib\syncPush.ts"
    $dst = Join-Path $appSync "syncPush.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\syncPull.ts"
    $dst = Join-Path $appSync "syncPull.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\syncPushEntities.ts"
    $dst = Join-Path $appSync "syncPushEntities.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\reconcileCore.ts"
    $dst = Join-Path $appSync "reconcile.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\reconcile.ts"
    $dst = Join-Path $appSync "reconcileHandler.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── application/auth/ ──
    $appAuth = Join-Path $SrcRoot "application\auth"
    Ensure-Dir $appAuth

    $src = Join-Path $SrcRoot "server\sessionGrant.ts"
    $dst = Join-Path $appAuth "sessionGrant.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\authSession.ts"
    $dst = Join-Path $appAuth "authSession.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── application/device/ ──
    $appDevice = Join-Path $SrcRoot "application\device"
    Ensure-Dir $appDevice

    $src = Join-Path $SrcRoot "server\deviceRegistry.ts"
    $dst = Join-Path $appDevice "deviceRegistry.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── application/tenant/ ──
    $appTenant = Join-Path $SrcRoot "application\tenant"
    Ensure-Dir $appTenant

    $src = Join-Path $SrcRoot "server\tenantSync.ts"
    $dst = Join-Path $appTenant "tenantSync.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\tenantSearch.ts"
    $dst = Join-Path $appTenant "tenantSearch.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── application/admin/ ──
    $appAdmin = Join-Path $SrcRoot "application\admin"
    Ensure-Dir $appAdmin

    $src = Join-Path $SrcRoot "server\superadminAccounts.ts"
    $dst = Join-Path $appAdmin "superadminAccounts.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\superadminAuth.ts"
    $dst = Join-Path $appAdmin "superadminAuth.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\superadminTenants.ts"
    $dst = Join-Path $appAdmin "superadminTenants.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "server\superadminTenants.types.ts"
    $dst = Join-Path $appAdmin "superadminTenants.types.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── application/ports/ — interface contracts for adapters ──
    $appPorts = Join-Path $SrcRoot "application\ports"
    Ensure-Dir $appPorts

    if (-not $DryRun) {
        $portsIndex = Join-Path $appPorts "index.ts"
        if (-not (Test-Path $portsIndex)) {
            $content = @"
// ============================================================================
// Application Ports (Interfaces)
// ============================================================================
// Contracts that infrastructure adapters must implement.
// Domain interfaces live in src/core/interfaces/.
// Application-level gateway interfaces live here.
// ============================================================================

// Example:
// export interface ISyncGateway {
//   push(tenantId: string, payload: PushBatchPayload): Promise<SyncPushResponse>;
//   pull(tenantId: string, cursors: Record<string, string>): Promise<PullEntityResponse>;
// }
//
// export interface ISessionGrantStore {
//   get(tenantId: string): Promise<SessionGrant | null>;
//   save(grant: SessionGrant): Promise<void>;
// }
"@
            Set-Content -Path $portsIndex -Value $content -Encoding UTF8
            Write-Step "created application/ports/index.ts placeholder"
        }
    } else {
        Write-Host "  [DRY] create application/ports/index.ts" -ForegroundColor DarkYellow
    }

    Write-Host "`n  [OK] Phase 2 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 3: Organize Infrastructure Layer
# ============================================================================
# Adapters for external systems: API client, IndexedDB/Dexie, device APIs,
# sync coordination, error tracking. Sourced from src/lib/ and src/db/.
# ============================================================================

function Run-Phase3 {
    Write-Phase 3 "Organize Infrastructure Layer"

    # ── infrastructure/api/ — HTTP client adapters ──
    $infraApi = Join-Path $SrcRoot "infrastructure\api"
    Ensure-Dir $infraApi

    $src = Join-Path $SrcRoot "lib\api.ts"
    $dst = Join-Path $infraApi "apiClient.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\deviceBlock.ts"
    $dst = Join-Path $infraApi "deviceBlock.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\realTimeSync.ts"
    $dst = Join-Path $infraApi "realTimeSync.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\syncRateLimiter.ts"
    $dst = Join-Path $infraApi "syncRateLimiter.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── infrastructure/device/ — device hardware adapters ──
    $infraDevice = Join-Path $SrcRoot "infrastructure\device"
    Ensure-Dir $infraDevice

    $src = Join-Path $SrcRoot "lib\deviceFingerprint.ts"
    $dst = Join-Path $infraDevice "fingerprint.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\getOrCreateDeviceId.tsx"
    $dst = Join-Path $infraDevice "getOrCreateDeviceId.tsx"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\initDeviceId.ts"
    $dst = Join-Path $infraDevice "initDeviceId.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\utils\haptics.ts"
    $dst = Join-Path $infraDevice "haptics.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── infrastructure/persistence/dexie/ — IndexedDB/local storage ──
    $infraDexie = Join-Path $SrcRoot "infrastructure\persistence\dexie"
    Ensure-Dir $infraDexie

    $src = Join-Path $SrcRoot "db\local-db.ts"
    $dst = Join-Path $infraDexie "localDb.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\indexeddb.ts"
    $dst = Join-Path $infraDexie "indexeddb.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\indexeddb.lazy.ts"
    $dst = Join-Path $infraDexie "indexeddb.lazy.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\localSessionGrant.ts"
    $dst = Join-Path $infraDexie "sessionGrantRepository.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\localTenant.ts"
    $dst = Join-Path $infraDexie "tenantRepository.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\transactionLogService.ts"
    $dst = Join-Path $infraDexie "transactionLogService.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\syncLogStore.ts"
    $dst = Join-Path $infraDexie "syncLogStore.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\stationQueries.ts"
    $dst = Join-Path $infraDexie "stationQueries.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── infrastructure/persistence/dexie/repositories/ — concrete impls ──
    $infraRepos = Join-Path $SrcRoot "infrastructure\persistence\dexie\repositories"
    Safe-Move-Dir (Join-Path $SrcRoot "lib\repositories") $infraRepos

    # ── infrastructure/persistence/drizzle/ — D1/server-side schema ──
    $infraDrizzle = Join-Path $SrcRoot "infrastructure\persistence\drizzle"
    Ensure-Dir $infraDrizzle

    $src = Join-Path $SrcRoot "db\schema.ts"
    $dst = Join-Path $infraDrizzle "schema.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "db\seed.ts"
    $dst = Join-Path $infraDrizzle "seed.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "db\seed-remote.ts"
    $dst = Join-Path $infraDrizzle "seed-remote.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "db\index.ts"
    $dst = Join-Path $infraDrizzle "index.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── infrastructure/sync/ — peer coordination ──
    $infraSync = Join-Path $SrcRoot "infrastructure\sync"
    Ensure-Dir $infraSync

    $src = Join-Path $SrcRoot "lib\peerSyncCoordinator.ts"
    $dst = Join-Path $infraSync "peerSyncCoordinator.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # ── infrastructure/error/ — error tracking adapter ──
    $infraError = Join-Path $SrcRoot "infrastructure\error"
    Ensure-Dir $infraError

    $src = Join-Path $SrcRoot "lib\errorTracker.ts"
    $dst = Join-Path $infraError "errorTracker.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    Write-Host "`n  [OK] Phase 3 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 4: Organize Presentation Layer
# ============================================================================
# UI layer: React components, hooks, routes, providers.
# Keeps the existing atomic structure (ui/block/section/layout).
# ============================================================================

function Run-Phase4 {
    Write-Phase 4 "Organize Presentation Layer"

    # ── presentation/components/ ──
    $presComponents = Join-Path $SrcRoot "presentation\components"
    Safe-Move-Dir (Join-Path $SrcRoot "components") $presComponents

    # ── presentation/hooks/ ──
    $presHooks = Join-Path $SrcRoot "presentation\hooks"
    Safe-Move-Dir (Join-Path $SrcRoot "hooks") $presHooks

    # ── presentation/routes/ ──
    $presRoutes = Join-Path $SrcRoot "presentation\routes"
    Safe-Move-Dir (Join-Path $SrcRoot "routes") $presRoutes

    # ── presentation/providers/ ──
    $presProviders = Join-Path $SrcRoot "presentation\providers"
    Safe-Move-Dir (Join-Path $SrcRoot "integrations\tanstack-query") $presProviders

    # ── presentation/lib/ — UI-only utilities ──
    $presLib = Join-Path $SrcRoot "presentation\lib"
    Ensure-Dir $presLib

    $src = Join-Path $SrcRoot "lib\utils\formatters.ts"
    $dst = Join-Path $presLib "formatters.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\utils\brand.ts"
    $dst = Join-Path $presLib "brand.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\utils.ts"
    $dst = Join-Path $presLib "utils.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    Write-Host "`n  [OK] Phase 4 complete" -ForegroundColor Green
    Write-Host ""
    Write-Host "  NOTE: Phase 4 moves entire directories." -ForegroundColor Red
    Write-Host "    Update path aliases in tsconfig.json:" -ForegroundColor Red
    Write-Host '    "#/components/*" -> "#/presentation/components/*"' -ForegroundColor Red
    Write-Host '    "#/hooks/*"      -> "#/presentation/hooks/*"' -ForegroundColor Red
    Write-Host '    "#/routes/*"     -> "#/presentation/routes/*"' -ForegroundColor Red
    Write-Host ""
    Write-Host "    Or keep old aliases pointing to new paths." -ForegroundColor DarkGray
}

# ============================================================================
# PHASE 5: Organize API Backend (api/src/)
# ============================================================================
# The Hono API already has a clean structure (routes, middleware, lib).
# We add domain/ and application/ subdirs for server-side logic that
# currently lives alongside route handlers.
# ============================================================================

function Run-Phase5 {
    Write-Phase 5 "Organize API Backend (api/src/)"

    # ── api/src/domain/ — server-side domain types & rules ──
    $apiDomain = Join-Path $ApiRoot "domain"
    Ensure-Dir $apiDomain

    if (-not $DryRun) {
        $apiDomainIndex = Join-Path $apiDomain "index.ts"
        if (-not (Test-Path $apiDomainIndex)) {
            $content = @"
// ============================================================================
// API Domain Layer
// ============================================================================
// Server-side business rules, value objects, and domain types.
// Extract pure logic from route handlers into this layer.
//
// Examples:
// - Sync conflict resolution rules
// - Card status transition rules
// - Tenant validation rules
// ============================================================================
export {};
"@
            Set-Content -Path $apiDomainIndex -Value $content -Encoding UTF8
            Write-Step "created api/src/domain/index.ts placeholder"
        }
    } else {
        Write-Host "  [DRY] create api/src/domain/index.ts" -ForegroundColor DarkYellow
    }

    # ── api/src/application/ — server-side use cases ──
    $apiApp = Join-Path $ApiRoot "application"
    Ensure-Dir $apiApp

    if (-not $DryRun) {
        $apiAppIndex = Join-Path $apiApp "index.ts"
        if (-not (Test-Path $apiAppIndex)) {
            $content = @"
// ============================================================================
// API Application Layer (Use Cases)
// ============================================================================
// Orchestration logic that coordinates domain + infrastructure on the server.
// Route handlers should delegate to use cases defined here.
//
// Examples:
// - SyncReconcileUseCase: orchestrate push/pull reconciliation
// - SessionGrantUseCase: validate and create session grants
// - CardIssuanceUseCase: issue new cards with full validation
// ============================================================================
export {};
"@
            Set-Content -Path $apiAppIndex -Value $content -Encoding UTF8
            Write-Step "created api/src/application/index.ts placeholder"
        }
    } else {
        Write-Host "  [DRY] create api/src/application/index.ts" -ForegroundColor DarkYellow
    }

    # Note: api/src/routes/ and api/src/middleware/ stay as-is.
    # They are already well-organized as thin HTTP handlers.

    Write-Host "`n  [OK] Phase 5 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 6: Rewrite Imports & Emit Migration Manifest
# ============================================================================
# Scans all .ts/.tsx files and replaces old import paths with new ones.
# Uses the #/ alias (not @/) as per tsconfig.json.
# ============================================================================

# Central import mapping — old alias -> new alias
# This is the single source of truth for all path rewrites.
$ImportMap = [ordered]@{
    # ── Phase 1: Domain ──
    '#/server/auth'              = '#/core/auth/authRules'
    '#/lib/roleOps'              = '#/core/auth/roleOps'
    '#/server/policy'            = '#/core/auth/policy'
    '#/lib/syncConflictResolver' = '#/core/sync/conflictResolver'
    '#/lib/utils/slugValidation' = '#/core/validation/slugValidation'

    # ── Phase 2: Application — Sync ──
    '#/lib/syncPush'             = '#/application/sync/syncPush.usecase'
    '#/lib/syncPull'             = '#/application/sync/syncPull.usecase'
    '#/lib/syncPushEntities'     = '#/application/sync/syncPushEntities.usecase'
    '#/server/reconcileCore'     = '#/application/sync/reconcile.usecase'
    '#/server/reconcile'         = '#/application/sync/reconcileHandler'

    # ── Phase 2: Application — Auth ──
    '#/server/sessionGrant'      = '#/application/auth/sessionGrant.usecase'
    '#/server/authSession'       = '#/application/auth/authSession.usecase'

    # ── Phase 2: Application — Device ──
    '#/server/deviceRegistry'    = '#/application/device/deviceRegistry.usecase'

    # ── Phase 2: Application — Tenant ──
    '#/server/tenantSync'        = '#/application/tenant/tenantSync.usecase'
    '#/server/tenantSearch'      = '#/application/tenant/tenantSearch.usecase'

    # ── Phase 2: Application — Admin ──
    '#/server/superadminAccounts'      = '#/application/admin/superadminAccounts.usecase'
    '#/server/superadminAuth'          = '#/application/admin/superadminAuth.usecase'
    '#/server/superadminTenants'       = '#/application/admin/superadminTenants.usecase'
    '#/server/superadminTenants.types' = '#/application/admin/superadminTenants.types'

    # ── Phase 3: Infrastructure — API ──
    '#/lib/api'                  = '#/infrastructure/api/apiClient'
    '#/lib/deviceBlock'          = '#/infrastructure/api/deviceBlock'
    '#/lib/realTimeSync'         = '#/infrastructure/api/realTimeSync'
    '#/lib/syncRateLimiter'      = '#/infrastructure/api/syncRateLimiter'

    # ── Phase 3: Infrastructure — Device ──
    '#/lib/deviceFingerprint'    = '#/infrastructure/device/fingerprint'
    '#/lib/getOrCreateDeviceId'  = '#/infrastructure/device/getOrCreateDeviceId'
    '#/lib/initDeviceId'         = '#/infrastructure/device/initDeviceId'
    '#/lib/utils/haptics'        = '#/infrastructure/device/haptics'

    # ── Phase 3: Infrastructure — Persistence (Dexie) ──
    '#/db/local-db'              = '#/infrastructure/persistence/dexie/localDb'
    '#/lib/indexeddb'            = '#/infrastructure/persistence/dexie/indexeddb'
    '#/lib/indexeddb.lazy'       = '#/infrastructure/persistence/dexie/indexeddb.lazy'
    '#/lib/localSessionGrant'    = '#/infrastructure/persistence/dexie/sessionGrantRepository'
    '#/lib/localTenant'          = '#/infrastructure/persistence/dexie/tenantRepository'
    '#/lib/transactionLogService'= '#/infrastructure/persistence/dexie/transactionLogService'
    '#/lib/syncLogStore'         = '#/infrastructure/persistence/dexie/syncLogStore'
    '#/lib/stationQueries'       = '#/infrastructure/persistence/dexie/stationQueries'
    '#/lib/repositories'         = '#/infrastructure/persistence/dexie/repositories'

    # ── Phase 3: Infrastructure — Persistence (Drizzle) ──
    '#/db/schema'                = '#/infrastructure/persistence/drizzle/schema'
    '#/db/seed'                  = '#/infrastructure/persistence/drizzle/seed'
    '#/db/seed-remote'           = '#/infrastructure/persistence/drizzle/seed-remote'
    '#/db/index'                 = '#/infrastructure/persistence/drizzle/index'

    # ── Phase 3: Infrastructure — Sync & Error ──
    '#/lib/peerSyncCoordinator'  = '#/infrastructure/sync/peerSyncCoordinator'
    '#/lib/errorTracker'         = '#/infrastructure/error/errorTracker'

    # ── Phase 4: Presentation — Lib ──
    '#/lib/utils/formatters'     = '#/presentation/lib/formatters'
    '#/lib/utils/brand'          = '#/presentation/lib/brand'
    '#/lib/utils'                = '#/presentation/lib/utils'

    # ── Phase 4: Presentation — Directory moves (prefix rewrites) ──
    '#/components/'              = '#/presentation/components/'
    '#/hooks/'                   = '#/presentation/hooks/'
    '#/routes/'                  = '#/presentation/routes/'
    '#/integrations/tanstack-query' = '#/presentation/providers'
}

function Run-Phase6 {
    Write-Phase 6 "Rewrite Imports & Emit Manifest"

    $files = Get-ChildItem -Path $SrcRoot -Recurse -Include *.ts,*.tsx |
             Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' }

    $totalFiles = 0
    $totalRewrites = 0

    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw -Encoding UTF8
        if (-not $content) { continue }

        $modified = $false
        $fileRewrites = 0

        foreach ($old in $ImportMap.Keys) {
            $new = $ImportMap[$old]
            $escapedOld = [regex]::Escape($old)

            if ($old.EndsWith("/")) {
                # Prefix match for directory moves
                $pattern = "(?<=(?:from|import\(|require\()\s*[`"'])$escapedOld"
                if ($content -match $pattern) {
                    $content = [regex]::Replace($content, $pattern, $new)
                    $modified = $true
                    $fileRewrites++
                }
            } else {
                # Exact match at quote boundary
                $pattern = "(?<=(?:from|import\(|require\()\s*[`"'])$escapedOld(?=[`"'])"
                if ($content -match $pattern) {
                    $content = [regex]::Replace($content, $pattern, $new)
                    $modified = $true
                    $fileRewrites++
                }
            }
        }

        if ($modified) {
            $rel = $file.FullName.Replace($ProjectRoot, "").TrimStart("\", "/")
            if ($DryRun) {
                Write-Host "  [DRY] rewrite $fileRewrites import(s) in $rel" -ForegroundColor DarkYellow
            } else {
                Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
                Write-Step "rewrote $fileRewrites import(s) in $rel"
            }
            $totalFiles++
            $totalRewrites += $fileRewrites
        }
    }

    # ── Emit migration manifest ──
    $manifestPath = Join-Path $ProjectRoot "scripts\migration-manifest.json"

    $moves = @()
    foreach ($old in $ImportMap.Keys) {
        $moves += @{
            from = $old
            to   = $ImportMap[$old]
            type = if ($old.EndsWith("/")) { "prefix" } else { "exact" }
        }
    }

    $manifest = @{
        version     = 2
        description = "Auto-generated import migration map for clean architecture v2."
        generatedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        pathAlias   = "#/"
        moves       = $moves
        pathAliasUpdates = @{
            '#/components/*' = '#/presentation/components/*'
            '#/hooks/*'      = '#/presentation/hooks/*'
            '#/routes/*'     = '#/presentation/routes/*'
        }
    }

    if ($DryRun) {
        Write-Host "  [DRY] would write $manifestPath" -ForegroundColor DarkYellow
    } else {
        $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
        Write-Step "wrote $manifestPath"
    }

    Write-Host "`n  [OK] Phase 6 complete - $totalRewrites rewrite(s) across $totalFiles file(s)" -ForegroundColor Green
}

# ============================================================================
# MAIN
# ============================================================================

Write-Host ""
Write-Host "+-------------------------------------------------------------+" -ForegroundColor Magenta
Write-Host "|  Clean Architecture Migration Script v2                      |" -ForegroundColor Magenta
Write-Host "|  koperasi-kegelapan                                          |" -ForegroundColor Magenta
Write-Host "+-------------------------------------------------------------+" -ForegroundColor Magenta
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY RUN] No files will be moved" -ForegroundColor Yellow
    Write-Host ""
}

# Verify we're in the right place
if (-not (Test-Path (Join-Path $SrcRoot "main.tsx"))) {
    Write-Host "  ERROR: Cannot find src/main.tsx. Run from project root." -ForegroundColor Red
    exit 1
}

# Check git status
$gitStatus = git -C $ProjectRoot status --porcelain 2>$null
if ($gitStatus -and -not $DryRun) {
    Write-Host "  WARNING: You have uncommitted changes." -ForegroundColor Yellow
    Write-Host "    Consider committing first so you can revert if needed." -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "    Continue anyway? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "  Aborted." -ForegroundColor Red
        exit 0
    }
}

# Run phases
if ($Phase -eq 0 -or $Phase -eq 1) { Run-Phase1 }
if ($Phase -eq 0 -or $Phase -eq 2) { Run-Phase2 }
if ($Phase -eq 0 -or $Phase -eq 3) { Run-Phase3 }
if ($Phase -eq 0 -or $Phase -eq 4) { Run-Phase4 }
if ($Phase -eq 0 -or $Phase -eq 5) { Run-Phase5 }
if ($Phase -eq 0 -or $Phase -eq 6) { Run-Phase6 }

# Summary
Write-Host ""
Write-Host "===============================================================" -ForegroundColor Green
Write-Host "  DONE" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Target structure:" -ForegroundColor White
Write-Host "    src/" -ForegroundColor White
Write-Host "      core/            <- Domain (interfaces, nfc, payload, auth, sync, validation)" -ForegroundColor DarkGray
Write-Host "      application/     <- Use Cases (sync, auth, device, tenant, admin)" -ForegroundColor DarkGray
Write-Host "      infrastructure/  <- Gateways (api, device, persistence, sync, error)" -ForegroundColor DarkGray
Write-Host "      presentation/    <- UI (components, hooks, routes, providers, lib)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "    api/src/" -ForegroundColor White
Write-Host "      domain/          <- Server domain rules" -ForegroundColor DarkGray
Write-Host "      application/     <- Server use cases" -ForegroundColor DarkGray
Write-Host "      routes/          <- HTTP handlers (thin)" -ForegroundColor DarkGray
Write-Host "      middleware/      <- Cross-cutting (auth, rate-limit, cors)" -ForegroundColor DarkGray
Write-Host "      lib/             <- Server utilities (jwt, logger)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. pnpm build              (verify no broken imports)" -ForegroundColor White
Write-Host "  2. pnpm test               (verify tests pass)" -ForegroundColor White
Write-Host "  3. pnpm run check:boundaries  (verify layering rules)" -ForegroundColor White
Write-Host "  4. Update tsconfig paths if you ran Phase 4" -ForegroundColor White
Write-Host "  5. Remove re-export barrels once all imports confirmed" -ForegroundColor White
Write-Host "  6. Update check-boundaries.ts rules for new paths" -ForegroundColor White
Write-Host ""

if ($DryRun) {
    Write-Host "  (Dry run - re-run without -DryRun to apply)" -ForegroundColor Yellow
}
