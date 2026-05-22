# ============================================================================
# Clean Architecture Migration Script
# ============================================================================
# This script safely moves files from the current structure to clean architecture.
# It creates barrel re-exports at old paths so existing imports don't break.
#
# Usage:
#   .\scripts\migrate-to-clean-arch.ps1 [-DryRun] [-Phase 1|2|3|4|5|6]
#
# Flags:
#   -DryRun   Show what would happen without actually moving anything
#   -Phase    Run only a specific phase (1-6). Default: all phases.
#
# Phases:
#   1 — Extract Domain Layer
#   2 — Extract Infrastructure Layer
#   3 — Extract Application Layer (Use Cases)
#   4 — Organize Presentation Layer
#   5 — Rewrite Imports Across Codebase
#   6 — Emit Migration Manifest (JSON for agents/codemods)
#
# IMPORTANT: Run this from the project root. Commit your work first!
# ============================================================================

param(
    [switch]$DryRun,
    [int]$Phase = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot | Split-Path -Parent
$SrcRoot = Join-Path $ProjectRoot "src"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step($msg) {
    Write-Host "  -> $msg" -ForegroundColor Cyan
}

function Write-Phase($num, $title) {
    Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "  PHASE ${num}: ${title}" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
}

function Write-Skip($msg) {
    Write-Host "  ⊘ SKIP: $msg" -ForegroundColor DarkGray
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

    # Ensure destination directory exists
    $destDir = Split-Path $dest -Parent
    Ensure-Dir $destDir

    if ($DryRun) {
        Write-Host "  [DRY] move $sourceRel -> $destRel" -ForegroundColor DarkYellow
        if ($reExportFrom) {
            Write-Host "  [DRY] create re-export at $sourceRel" -ForegroundColor DarkYellow
        }
    } else {
        # Move the file
        Move-Item -Path $source -Destination $dest -Force
        Write-Step "moved $sourceRel -> $destRel"

        # Create barrel re-export at old location so imports don't break
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

# ── Compute relative import path ────────────────────────────────────────────
# Given old file location and new file location, compute the relative import
# path to use in the re-export barrel.

function Get-ReExportPath($oldFile, $newFile) {
    $oldDir = Split-Path $oldFile -Parent
    $newFileNoExt = [System.IO.Path]::ChangeExtension($newFile, $null).TrimEnd(".")

    # Get relative path from old location to new location (PS 5.1 compatible)
    $oldDirUri = New-Object System.Uri("$oldDir\")
    $newFileUri = New-Object System.Uri($newFileNoExt)
    $relativePath = $oldDirUri.MakeRelativeUri($newFileUri).ToString()
    # Decode URI encoding
    $relativePath = [System.Uri]::UnescapeDataString($relativePath)
    # Normalize to forward slashes for JS imports
    $relativePath = $relativePath.Replace("\", "/")
    # Ensure it starts with ./
    if (-not $relativePath.StartsWith(".")) {
        $relativePath = "./$relativePath"
    }
    return $relativePath
}

# ============================================================================
# PHASE 1: Extract Domain Layer
# Pure business logic with zero framework dependencies
# ============================================================================

function Run-Phase1 {
    Write-Phase 1 "Extract Domain Layer"

    # domain/auth/
    $domainAuth = Join-Path $SrcRoot "domain\auth"
    Ensure-Dir $domainAuth

    $src = Join-Path $SrcRoot "server\auth.ts"
    $dst = Join-Path $domainAuth "authRules.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\roleOps.ts"
    $dst = Join-Path $domainAuth "roleOps.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # domain/sync/
    $domainSync = Join-Path $SrcRoot "domain\sync"
    Ensure-Dir $domainSync

    $src = Join-Path $SrcRoot "lib\syncConflictResolver.ts"
    $dst = Join-Path $domainSync "conflictResolver.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # domain/card/ — extract Card type (create manually, types come from local-db)
    $domainCard = Join-Path $SrcRoot "domain\card"
    Ensure-Dir $domainCard

    # domain/member/
    $domainMember = Join-Path $SrcRoot "domain\member"
    Ensure-Dir $domainMember

    # domain/transaction/
    $domainTransaction = Join-Path $SrcRoot "domain\transaction"
    Ensure-Dir $domainTransaction

    # lib/slugValidation → domain validation
    $src = Join-Path $SrcRoot "lib\slugValidation.ts"
    $dst = Join-Path $SrcRoot "domain\validation\slugValidation.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    Write-Host "`n  ✓ Phase 1 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 2: Extract Infrastructure Layer
# Adapters for external systems (API, DB, device, NFC hardware)
# ============================================================================

function Run-Phase2 {
    Write-Phase 2 "Extract Infrastructure Layer"

    # infrastructure/api/
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

    # infrastructure/device/
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

    $src = Join-Path $SrcRoot "lib\haptics.ts"
    $dst = Join-Path $infraDevice "haptics.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # infrastructure/persistence/dexie/
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

    # infrastructure/persistence/drizzle/
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

    $src = Join-Path $SrcRoot "db\index.ts"
    $dst = Join-Path $infraDrizzle "index.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # infrastructure/sync/ (peer coordination)
    $infraSync = Join-Path $SrcRoot "infrastructure\sync"
    Ensure-Dir $infraSync

    $src = Join-Path $SrcRoot "lib\peerSyncCoordinator.ts"
    $dst = Join-Path $infraSync "peerSyncCoordinator.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # infrastructure/error/
    $infraError = Join-Path $SrcRoot "infrastructure\error"
    Ensure-Dir $infraError

    $src = Join-Path $SrcRoot "lib\errorTracker.ts"
    $dst = Join-Path $infraError "errorTracker.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    Write-Host "`n  ✓ Phase 2 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 3: Extract Application Layer (Use Cases)
# Orchestration logic that coordinates domain + infrastructure
# ============================================================================

function Run-Phase3 {
    Write-Phase 3 "Extract Application Layer (Use Cases)"

    # application/sync/
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

    # application/auth/
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

    # application/device/
    $appDevice = Join-Path $SrcRoot "application\device"
    Ensure-Dir $appDevice

    $src = Join-Path $SrcRoot "server\deviceRegistry.ts"
    $dst = Join-Path $appDevice "deviceRegistry.usecase.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    # application/tenant/
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

    # application/admin/
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

    # application/ports/ — create placeholder interfaces
    $appPorts = Join-Path $SrcRoot "application\ports"
    Ensure-Dir $appPorts

    if (-not $DryRun) {
        $portsIndex = Join-Path $appPorts "index.ts"
        if (-not (Test-Path $portsIndex)) {
            $content = @"
// ============================================================================
// Application Ports (Interfaces)
// These define the contracts that infrastructure adapters must implement.
// Add your repository and gateway interfaces here.
// ============================================================================

// Example:
// export interface ICardRepository {
//   findByTenantAndId(tenantId: string, cardId: string): Promise<Card | null>;
//   save(card: Card): Promise<void>;
// }
//
// export interface ISyncGateway {
//   push(tenantId: string, payload: PushBatchPayload): Promise<SyncPushResponse>;
//   pull(tenantId: string, cursors: Record<string, string>): Promise<PullEntityResponse>;
// }
"@
            Set-Content -Path $portsIndex -Value $content -Encoding UTF8
            Write-Step "created ports/index.ts placeholder"
        }
    } else {
        Write-Host "  [DRY] create application/ports/index.ts" -ForegroundColor DarkYellow
    }

    Write-Host "`n  ✓ Phase 3 complete" -ForegroundColor Green
}

# ============================================================================
# PHASE 4: Organize Presentation Layer
# Move hooks, routes, components under presentation/
# ============================================================================

function Run-Phase4 {
    Write-Phase 4 "Organize Presentation Layer"

    # presentation/components/ — move entire components dir
    $presComponents = Join-Path $SrcRoot "presentation\components"
    Safe-Move-Dir (Join-Path $SrcRoot "components") $presComponents

    # presentation/hooks/
    $presHooks = Join-Path $SrcRoot "presentation\hooks"
    Safe-Move-Dir (Join-Path $SrcRoot "hooks") $presHooks

    # presentation/routes/
    $presRoutes = Join-Path $SrcRoot "presentation\routes"
    Safe-Move-Dir (Join-Path $SrcRoot "routes") $presRoutes

    # presentation/providers/
    $presProviders = Join-Path $SrcRoot "presentation\providers"
    Ensure-Dir $presProviders

    # Move tanstack-query provider
    $src = Join-Path $SrcRoot "integrations\tanstack-query"
    $dst = Join-Path $presProviders "tanstack-query"
    Safe-Move-Dir $src $dst

    # presentation/lib/ (UI-only utilities)
    $presLib = Join-Path $SrcRoot "presentation\lib"
    Ensure-Dir $presLib

    $src = Join-Path $SrcRoot "lib\formatters.ts"
    $dst = Join-Path $presLib "formatters.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\brand.ts"
    $dst = Join-Path $presLib "brand.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    $src = Join-Path $SrcRoot "lib\utils.ts"
    $dst = Join-Path $presLib "utils.ts"
    $reExport = Get-ReExportPath $src $dst
    Safe-Move $src $dst $reExport

    Write-Host "`n  ✓ Phase 4 complete" -ForegroundColor Green
    Write-Host ""
    Write-Host "  ⚠ IMPORTANT: Phase 4 moves entire directories." -ForegroundColor Red
    Write-Host "    You will need to update path aliases in tsconfig.json:" -ForegroundColor Red
    Write-Host '    "@/components/*" -> "@/presentation/components/*"' -ForegroundColor Red
    Write-Host '    "@/hooks/*"      -> "@/presentation/hooks/*"' -ForegroundColor Red
    Write-Host '    "@/routes/*"     -> "@/presentation/routes/*"' -ForegroundColor Red
    Write-Host ""
    Write-Host "    Or keep old aliases pointing to new paths." -ForegroundColor DarkGray
}

# ============================================================================
# PHASE 5: Rewrite Imports Across the Codebase
# Scans all .ts/.tsx files and replaces old import paths with new ones.
# Also emits a migration-manifest.json for agent/codemod consumption.
# ============================================================================

# Central import mapping — old alias → new alias
# This is the single source of truth for all path rewrites.
$ImportMap = [ordered]@{
    # Phase 1: Domain
    '@/server/auth'              = '@/domain/auth/authRules'
    '@/lib/roleOps'              = '@/domain/auth/roleOps'
    '@/lib/syncConflictResolver' = '@/domain/sync/conflictResolver'
    '@/lib/slugValidation'       = '@/domain/validation/slugValidation'

    # Phase 2: Infrastructure — API
    '@/lib/api'                  = '@/infrastructure/api/apiClient'
    '@/lib/deviceBlock'          = '@/infrastructure/api/deviceBlock'
    '@/lib/realTimeSync'         = '@/infrastructure/api/realTimeSync'
    '@/lib/syncRateLimiter'      = '@/infrastructure/api/syncRateLimiter'

    # Phase 2: Infrastructure — Device
    '@/lib/deviceFingerprint'    = '@/infrastructure/device/fingerprint'
    '@/lib/getOrCreateDeviceId'  = '@/infrastructure/device/getOrCreateDeviceId'
    '@/lib/initDeviceId'         = '@/infrastructure/device/initDeviceId'
    '@/lib/haptics'              = '@/infrastructure/device/haptics'

    # Phase 2: Infrastructure — Persistence (Dexie)
    '@/db/local-db'              = '@/infrastructure/persistence/dexie/localDb'
    '@/lib/indexeddb'            = '@/infrastructure/persistence/dexie/indexeddb'
    '@/lib/localSessionGrant'    = '@/infrastructure/persistence/dexie/sessionGrantRepository'
    '@/lib/localTenant'          = '@/infrastructure/persistence/dexie/tenantRepository'
    '@/lib/transactionLogService'= '@/infrastructure/persistence/dexie/transactionLogService'
    '@/lib/syncLogStore'         = '@/infrastructure/persistence/dexie/syncLogStore'

    # Phase 2: Infrastructure — Persistence (Drizzle)
    '@/db/schema'                = '@/infrastructure/persistence/drizzle/schema'
    '@/db/seed'                  = '@/infrastructure/persistence/drizzle/seed'
    '@/db/index'                 = '@/infrastructure/persistence/drizzle/index'

    # Phase 2: Infrastructure — Sync & Error
    '@/lib/peerSyncCoordinator'  = '@/infrastructure/sync/peerSyncCoordinator'
    '@/lib/errorTracker'         = '@/infrastructure/error/errorTracker'

    # Phase 3: Application — Sync
    '@/lib/syncPush'             = '@/application/sync/syncPush.usecase'
    '@/lib/syncPull'             = '@/application/sync/syncPull.usecase'
    '@/lib/syncPushEntities'     = '@/application/sync/syncPushEntities.usecase'
    '@/server/reconcileCore'     = '@/application/sync/reconcile.usecase'

    # Phase 3: Application — Auth
    '@/server/sessionGrant'      = '@/application/auth/sessionGrant.usecase'
    '@/server/authSession'       = '@/application/auth/authSession.usecase'

    # Phase 3: Application — Device
    '@/server/deviceRegistry'    = '@/application/device/deviceRegistry.usecase'

    # Phase 3: Application — Tenant
    '@/server/tenantSync'        = '@/application/tenant/tenantSync.usecase'
    '@/server/tenantSearch'      = '@/application/tenant/tenantSearch.usecase'

    # Phase 3: Application — Admin
    '@/server/superadminAccounts'      = '@/application/admin/superadminAccounts.usecase'
    '@/server/superadminAuth'          = '@/application/admin/superadminAuth.usecase'
    '@/server/superadminTenants'       = '@/application/admin/superadminTenants.usecase'
    '@/server/superadminTenants.types' = '@/application/admin/superadminTenants.types'

    # Phase 4: Presentation — Lib
    '@/lib/formatters'           = '@/presentation/lib/formatters'
    '@/lib/brand'                = '@/presentation/lib/brand'
    '@/lib/utils'                = '@/presentation/lib/utils'

    # Phase 4: Presentation — Directory moves (prefix rewrites)
    '@/components/'              = '@/presentation/components/'
    '@/hooks/'                   = '@/presentation/hooks/'
    '@/routes/'                  = '@/presentation/routes/'
    '@/integrations/tanstack-query' = '@/presentation/providers/tanstack-query'
}

function Run-Phase5 {
    Write-Phase 5 "Rewrite Imports Across Codebase"

    $files = Get-ChildItem -Path $SrcRoot -Recurse -Include *.ts,*.tsx |
             Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' }

    $totalFiles = 0
    $totalRewrites = 0

    # Build a lookup of old file paths (relative to src/) → new alias
    # This is used for resolving relative imports like ../lib/api
    $RelativePathMap = @{}
    foreach ($old in $ImportMap.Keys) {
        if ($old.StartsWith('@/') -and -not $old.EndsWith('/')) {
            # Strip @/ prefix to get src-relative path, e.g. "lib/api"
            $srcRelative = $old.Substring(2)
            $RelativePathMap[$srcRelative] = $ImportMap[$old]
        }
    }

    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw -Encoding UTF8
        if (-not $content) { continue }

        $modified = $false
        $fileRewrites = 0

        # ── Pass 1: Alias imports (from '@/...' and import('@/...')) ──────────

        foreach ($old in $ImportMap.Keys) {
            $new = $ImportMap[$old]
            $escapedOld = [regex]::Escape($old)

            if ($old.EndsWith("/")) {
                # Prefix match: from '@/components/...' or import('@/components/...')
                # Matches: from "...", from '...', import("..."), import('...'), require("..."), require('...')
                $pattern = "(?<=(?:from|import\(|require\()\s*[`"'])$escapedOld"
                if ($content -match $pattern) {
                    $content = [regex]::Replace($content, $pattern, $new)
                    $modified = $true
                    $fileRewrites++
                }
            } else {
                # Exact match: must end at quote boundary
                $pattern = "(?<=(?:from|import\(|require\()\s*[`"'])$escapedOld(?=[`"'])"
                if ($content -match $pattern) {
                    $content = [regex]::Replace($content, $pattern, $new)
                    $modified = $true
                    $fileRewrites++
                }
            }
        }

        # ── Pass 2: Relative imports (../lib/api, ./syncPush, etc.) ──────────

        $fileDir = Split-Path $file.FullName -Parent
        # Get this file's directory relative to src/ (forward slashes)
        $fileDirRelToSrc = [System.IO.Path]::GetRelativePath($SrcRoot, $fileDir).Replace("\", "/")

        # Match all relative import specifiers: from './...' | from '../...' | import('./...') | import('../...')
        $relativePattern = "(?<=(?:from|import\(|require\()\s*[`"'])(\.\.?/[^`"']+)(?=[`"'])"
        $relMatches = [regex]::Matches($content, $relativePattern)

        # Process in reverse order so string indices stay valid
        $relMatchList = @($relMatches) | Sort-Object { $_.Index } -Descending

        foreach ($match in $relMatchList) {
            $relImport = $match.Value  # e.g. "#/lib/api" or "./syncPush"

            # Resolve to src-relative path
            # Combine current file's dir (relative to src) with the relative import
            $resolvedParts = ($fileDirRelToSrc + "/" + $relImport) -split "/"
            $normalized = @()
            foreach ($part in $resolvedParts) {
                if ($part -eq "." -or $part -eq "") { continue }
                if ($part -eq "..") {
                    if ($normalized.Count -gt 0) { $normalized = $normalized[0..($normalized.Count - 2)] }
                } else {
                    $normalized += $part
                }
            }
            $resolvedSrcRelative = $normalized -join "/"  # e.g. "lib/api"

            # Check if this resolved path is in our map
            if ($RelativePathMap.ContainsKey($resolvedSrcRelative)) {
                $newAlias = $RelativePathMap[$resolvedSrcRelative]
                $start = $match.Index
                $length = $match.Length
                $content = $content.Substring(0, $start) + $newAlias + $content.Substring($start + $length)
                $modified = $true
                $fileRewrites++
            }
        }

        # ── Write back ───────────────────────────────────────────────────────

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

    Write-Host "`n  ✓ Phase 5 complete - $totalRewrites rewrite(s) across $totalFiles file(s)" -ForegroundColor Green
}

# ============================================================================
# PHASE 6: Emit Migration Manifest (JSON)
# Produces scripts/migration-manifest.json for agent/codemod consumption.
# ============================================================================

function Run-Phase6 {
    Write-Phase 6 "Emit Migration Manifest"

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
        version     = 1
        description = "Auto-generated import migration map. Use with codemods or AI agents."
        generatedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        moves       = $moves
        pathAliasUpdates = @{
            '@/components/*' = '@/presentation/components/*'
            '@/hooks/*'      = '@/presentation/hooks/*'
            '@/routes/*'     = '@/presentation/routes/*'
        }
    }

    if ($DryRun) {
        Write-Host "  [DRY] would write $manifestPath" -ForegroundColor DarkYellow
    } else {
        $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
        Write-Step "wrote $manifestPath"
    }

    Write-Host "`n  ✓ Phase 6 complete" -ForegroundColor Green
}

# ============================================================================
# MAIN
# ============================================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║  Clean Architecture Migration Script                     ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

if ($DryRun) {
    Write-Host "  🔍 DRY RUN MODE - no files will be moved" -ForegroundColor Yellow
    Write-Host ""
}

# Verify we're in the right place
if (-not (Test-Path (Join-Path $SrcRoot "main.tsx"))) {
    Write-Host "  ✗ ERROR: Cannot find src/main.tsx. Run from project root." -ForegroundColor Red
    exit 1
}

# Check git status
$gitStatus = git -C $ProjectRoot status --porcelain 2>$null
if ($gitStatus -and -not $DryRun) {
    Write-Host "  ⚠ WARNING: You have uncommitted changes." -ForegroundColor Yellow
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
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  DONE" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Run your build:  pnpm build (or npm run build)" -ForegroundColor White
Write-Host "  2. Run tests:       pnpm test" -ForegroundColor White
Write-Host "  3. Check scripts/migration-manifest.json for agent consumption" -ForegroundColor White
Write-Host "  4. Remove re-export barrels once all imports are confirmed rewritten" -ForegroundColor White
Write-Host "  5. Update tsconfig paths if you ran Phase 4" -ForegroundColor White
Write-Host ""

if ($DryRun) {
    Write-Host "  (This was a dry run - re-run without -DryRun to apply)" -ForegroundColor Yellow
}
