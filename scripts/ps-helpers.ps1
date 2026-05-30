# PowerShell Helper Functions for Agent & Developer Use
# Add to your profile: . "d:\dev\stradivary\koperasi-kegelapan\scripts\ps-helpers.ps1"
# Or copy individual functions to $PROFILE

function wc {
    param([Parameter(Mandatory)][string]$Path)
    Get-Content $Path | Measure-Object -Line -Word -Character
}

function loc {
    param(
        [string]$Path = ".",
        [string[]]$Include = @("*.ts", "*.tsx", "*.js", "*.jsx")
    )
    $files = Get-ChildItem -Path $Path -Recurse -Include $Include -File
    $total = 0
    foreach ($f in $files) {
        $lines = (Get-Content $f | Where-Object { $_.Trim() -ne "" }).Count
        $total += $lines
    }
    [PSCustomObject]@{
        Files = $files.Count
        NonBlankLines = $total
        Path = $Path
    }
}

function ctx {
    param([Parameter(Mandatory)][string]$Path)
    if (Test-Path $Path -PathType Container) {
        $chars = (Get-ChildItem -Path $Path -Recurse -Include "*.ts","*.tsx" -File | ForEach-Object { (Get-Content $_ -Raw).Length } | Measure-Object -Sum).Sum
    } else {
        $chars = (Get-Content $Path -Raw).Length
    }
    [PSCustomObject]@{
        Characters = $chars
        EstimatedTokens = [math]::Ceiling($chars / 4)
        Path = $Path
    }
}

function tree {
    param(
        [string]$Path = ".",
        [int]$Depth = 3
    )
    function Show-Tree($dir, $prefix, $currentDepth) {
        if ($currentDepth -gt $Depth) { return }
        $items = Get-ChildItem -Path $dir | Sort-Object { -not $_.PSIsContainer }, Name
        for ($i = 0; $i -lt $items.Count; $i++) {
            $item = $items[$i]
            $isLast = ($i -eq $items.Count - 1)
            $connector = if ($isLast) { "└── " } else { "├── " }
            $newPrefix = if ($isLast) { "$prefix    " } else { "$prefix│   " }
            Write-Output "$prefix$connector$($item.Name)"
            if ($item.PSIsContainer) {
                Show-Tree $item.FullName $newPrefix ($currentDepth + 1)
            }
        }
    }
    Write-Output (Resolve-Path $Path).Path
    Show-Tree (Resolve-Path $Path).Path "" 1
}

function grep {
    param(
        [Parameter(Mandatory)][string]$Pattern,
        [string]$Path = ".",
        [string[]]$Include = @("*.*")
    )
    Get-ChildItem -Path $Path -Recurse -Include $Include -File |
        Select-String -Pattern $Pattern |
        ForEach-Object { "$($_.RelativePath):$($_.LineNumber): $($_.Line.Trim())" }
}

function touch {
    param([Parameter(Mandatory)][string]$Path)
    if (Test-Path $Path) {
        (Get-Item $Path).LastWriteTime = Get-Date
    } else {
        New-Item -Path $Path -ItemType File -Force | Out-Null
    }
}

function head {
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$Lines = 10
    )
    Get-Content $Path -TotalCount $Lines
}

function tail {
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$Lines = 10
    )
    Get-Content $Path -Tail $Lines
}

function insert {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][int]$Line,
        [Parameter(Mandatory)][string]$Text
    )
    $content = @(Get-Content $Path)
    $index = [math]::Max(0, [math]::Min($Line - 1, $content.Count))
    $newContent = @()
    $newContent += $content[0..($index - 1)]
    $newContent += $Text
    if ($index -lt $content.Count) {
        $newContent += $content[$index..($content.Count - 1)]
    }
    $newContent | Set-Content $Path
    Write-Host "Inserted at line $Line in $Path" -ForegroundColor Green
}

function append {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Text
    )
    Add-Content -Path $Path -Value $Text
    Write-Host "Appended to $Path" -ForegroundColor Green
}

function prepend {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Text
    )
    $content = Get-Content $Path -Raw
    ($Text + "`n" + $content) | Set-Content $Path
    Write-Host "Prepended to $Path" -ForegroundColor Green
}

function replace {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Old,
        [Parameter(Mandatory)][string]$New
    )
    $content = Get-Content $Path -Raw
    $count = ([regex]::Matches($content, [regex]::Escape($Old))).Count
    if ($count -eq 0) {
        Write-Host "No matches found for '$Old' in $Path" -ForegroundColor Red
        return
    }
    $content = $content.Replace($Old, $New)
    $content | Set-Content $Path -NoNewline
    Write-Host "Replaced $count occurrence(s) in $Path" -ForegroundColor Green
}

function Show-PsHelpers {
    $helpers = @(
        @{ Name = "wc";      Usage = "wc <path>";                           Desc = "Count lines, words, and characters in a file" }
        @{ Name = "loc";     Usage = "loc [path] [-Include *.ts,*.tsx]";    Desc = "Count non-blank lines of code recursively" }
        @{ Name = "ctx";     Usage = "ctx <path>";                          Desc = "Estimate token count (chars / 4) for file or folder" }
        @{ Name = "tree";    Usage = "tree [path] [-Depth 3]";             Desc = "Show directory tree structure" }
        @{ Name = "grep";    Usage = "grep <pattern> [path] [-Include]";   Desc = "Recursive text search across files" }
        @{ Name = "touch";   Usage = "touch <path>";                        Desc = "Create empty file or update timestamp" }
        @{ Name = "head";    Usage = "head <path> [lines=10]";             Desc = "Show first N lines of a file" }
        @{ Name = "tail";    Usage = "tail <path> [lines=10]";             Desc = "Show last N lines of a file" }
        @{ Name = "insert";  Usage = "insert <path> <line#> <text>";       Desc = "Insert text at a specific line number" }
        @{ Name = "append";  Usage = "append <path> <text>";               Desc = "Append text to end of file" }
        @{ Name = "prepend"; Usage = "prepend <path> <text>";              Desc = "Prepend text to beginning of file" }
        @{ Name = "replace"; Usage = "replace <path> <old> <new>";         Desc = "Replace all occurrences of text in a file" }
    )

    Write-Host ""
    Write-Host "  PS Helpers" -ForegroundColor Cyan
    Write-Host "  ──────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    foreach ($h in $helpers) {
        Write-Host "  $($h.Name.PadRight(8))" -ForegroundColor Green -NoNewline
        Write-Host "$($h.Usage.PadRight(40))" -ForegroundColor Yellow -NoNewline
        Write-Host "$($h.Desc)" -ForegroundColor Gray
    }
    Write-Host "  ──────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  Run " -NoNewline
    Write-Host "--tools" -ForegroundColor Yellow -NoNewline
    Write-Host " anytime to see this list again."
    Write-Host ""
}

# Register --tools as a quick alias
Set-Alias -Name "--tools" -Value Show-PsHelpers

Show-PsHelpers
