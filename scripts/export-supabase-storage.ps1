# Des Moines AI Pulse - Supabase Storage Export
# =============================================
# Mirrors every object in the project's public storage buckets to local disk,
# preserving bucket and key layout so the tree can be re-uploaded to a
# self-hosted Supabase stack with identical object paths (existing URLs keep
# working once DNS points at the new host).
#
# The object list comes from storage.objects via the Supabase Management API.
# The files themselves come from the public object endpoint over plain HTTP,
# so no service_role key and no Docker are involved.
#
# Prerequisites:
# 1. PowerShell 7+ (uses ForEach-Object -Parallel)
# 2. .env in the repo root with SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL
#
# Usage:
#   .\scripts\export-supabase-storage.ps1                 # mirror everything
#   .\scripts\export-supabase-storage.ps1 -DryRun         # list only, no download
#   .\scripts\export-supabase-storage.ps1 -Buckets media  # one bucket
#   .\scripts\export-supabase-storage.ps1                 # rerun to resume
#
# Reruns are resumable: an object whose local file already matches the
# recorded byte size is skipped, so an interrupted run costs nothing to finish.

param(
    [string]   $OutDir      = "C:\Users\dpearson\Documents\dmi-supabase-export",
    [string]   $EnvFile     = (Join-Path $PSScriptRoot "..\.env"),
    [string[]] $Buckets     = @(),
    [int]      $Concurrency = 8,
    [int]      $MaxRetries  = 3,
    [switch]   $DryRun
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "PowerShell 7+ required (found $($PSVersionTable.PSVersion)). Run with pwsh."
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Des Moines AI Pulse - Storage Export" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Load credentials from .env ------------------------------------------------

if (-not (Test-Path $EnvFile)) { throw "Env file not found: $EnvFile" }

$envVars = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $envVars[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

$token   = $envVars['SUPABASE_ACCESS_TOKEN']
$baseUrl = $envVars['VITE_SUPABASE_URL']
if (-not $token)   { throw "SUPABASE_ACCESS_TOKEN missing from $EnvFile" }
if (-not $baseUrl) { throw "VITE_SUPABASE_URL missing from $EnvFile" }

$baseUrl = $baseUrl.TrimEnd('/')
$refMatch = [regex]::Match($baseUrl, 'https://([^.]+)\.supabase\.')
if (-not $refMatch.Success) {
    throw "VITE_SUPABASE_URL does not look like a Supabase cloud URL: $baseUrl"
}
$projectRef = $refMatch.Groups[1].Value

Write-Host "Project:  $projectRef" -ForegroundColor Gray
Write-Host "Endpoint: $baseUrl" -ForegroundColor Gray
Write-Host "Output:   $OutDir" -ForegroundColor Gray
Write-Host ""

# --- Helper: run a read-only SQL query through the Management API ---------------

function Invoke-MgmtQuery {
    param([string] $Sql)

    $body = @{ query = $Sql } | ConvertTo-Json -Compress
    return Invoke-RestMethod `
        -Method  Post `
        -Uri     "https://api.supabase.com/v1/projects/$projectRef/database/query" `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType "application/json" `
        -Body    $body
}

# --- Enumerate buckets ---------------------------------------------------------

Write-Host "Listing buckets..." -ForegroundColor Yellow

$bucketRows = Invoke-MgmtQuery @"
select b.name,
       b.public,
       count(o.id)                                           as objects,
       coalesce(sum((o.metadata->>'size')::bigint), 0)        as bytes
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.name, b.public
order by b.name
"@

$targets = $bucketRows | Where-Object { $_.objects -gt 0 }
if ($Buckets.Count -gt 0) {
    $targets = $targets | Where-Object { $Buckets -contains $_.name }
}
if (-not $targets) { throw "No matching buckets with objects." }

$private = $targets | Where-Object { -not $_.public }
if ($private) {
    Write-Host "WARNING: these buckets are private and cannot be fetched over the public endpoint:" -ForegroundColor Red
    $private | ForEach-Object { Write-Host "  $($_.name)" -ForegroundColor Red }
    Write-Host "Export them with 'supabase storage cp' using a service_role key instead." -ForegroundColor Red
    Write-Host ""
    $targets = $targets | Where-Object { $_.public }
    if (-not $targets) { throw "Nothing left to export." }
}

foreach ($b in $targets) {
    Write-Host ("  {0,-16} {1,6} objects  {2,8:N1} MB" -f $b.name, $b.objects, ($b.bytes / 1MB)) -ForegroundColor Gray
}
Write-Host ""

# --- Enumerate objects (paged) -------------------------------------------------

Write-Host "Listing objects..." -ForegroundColor Yellow

$nameList  = ($targets | ForEach-Object { "'" + ($_.name -replace "'", "''") + "'" }) -join ", "
$pageSize  = 1000
$offset    = 0
$objects   = [System.Collections.Generic.List[object]]::new()

while ($true) {
    $page = Invoke-MgmtQuery @"
select b.name                              as bucket,
       o.name                              as key,
       (o.metadata->>'size')::bigint       as size,
       o.metadata->>'mimetype'             as mimetype,
       o.metadata->>'eTag'                 as etag,
       o.updated_at                        as updated_at
from storage.objects o
join storage.buckets b on b.id = o.bucket_id
where b.name in ($nameList)
  and o.metadata is not null
  and coalesce(o.metadata->>'size', '0') <> '0'
order by b.name, o.name
limit $pageSize offset $offset
"@

    if (-not $page -or $page.Count -eq 0) { break }
    $objects.AddRange([object[]]$page)
    if ($page.Count -lt $pageSize) { break }
    $offset += $pageSize
}

$totalBytes = ($objects | Measure-Object -Property size -Sum).Sum
Write-Host ("  {0} objects, {1:N1} MB" -f $objects.Count, ($totalBytes / 1MB)) -ForegroundColor Gray
Write-Host ""

# --- Write manifest ------------------------------------------------------------

$storageDir = Join-Path $OutDir "storage"
New-Item -ItemType Directory -Force -Path $storageDir | Out-Null

# A scoped run gets its own manifest so it cannot clobber the full-export one.
$manifestName = if ($Buckets.Count -gt 0) { "storage-manifest-" + ($Buckets -join "-") + ".json" } else { "storage-manifest.json" }
$manifestPath = Join-Path $OutDir $manifestName
@{
    project     = $projectRef
    endpoint    = $baseUrl
    objectCount = $objects.Count
    totalBytes  = $totalBytes
    buckets     = @($targets | ForEach-Object { @{ name = $_.name; public = $_.public } })
    objects     = @($objects)
} | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding utf8

Write-Host "Manifest written: $manifestPath" -ForegroundColor Green
Write-Host "  (records mimetype per object so the re-upload can set Content-Type correctly)" -ForegroundColor Gray
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN: manifest only, no files downloaded." -ForegroundColor Yellow
    exit 0
}

# --- Download ------------------------------------------------------------------

Write-Host "Downloading with $Concurrency workers..." -ForegroundColor Yellow

$results = $objects | ForEach-Object -ThrottleLimit $Concurrency -Parallel {
    $obj        = $_
    $storageDir = $using:storageDir
    $baseUrl    = $using:baseUrl
    $maxRetries = $using:MaxRetries

    $localPath = Join-Path $storageDir (Join-Path $obj.bucket ($obj.key -replace '/', [IO.Path]::DirectorySeparatorChar))

    # Resume: an existing file of the recorded size is already done.
    if (Test-Path -LiteralPath $localPath) {
        if ((Get-Item -LiteralPath $localPath).Length -eq $obj.size) {
            return [pscustomobject]@{ Key = "$($obj.bucket)/$($obj.key)"; Status = "skipped"; Bytes = $obj.size; Error = $null }
        }
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $localPath) | Out-Null

    # Each path segment is escaped separately so '/' stays a separator.
    $encodedKey = ($obj.key -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $url        = "$baseUrl/storage/v1/object/public/$($obj.bucket)/$encodedKey"

    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        try {
            Invoke-WebRequest -Uri $url -OutFile $localPath -TimeoutSec 120 | Out-Null

            $actual = (Get-Item -LiteralPath $localPath).Length
            if ($actual -ne $obj.size) {
                throw "size mismatch: expected $($obj.size), got $actual"
            }
            return [pscustomobject]@{ Key = "$($obj.bucket)/$($obj.key)"; Status = "downloaded"; Bytes = $actual; Error = $null }
        }
        catch {
            if ($attempt -eq $maxRetries) {
                return [pscustomobject]@{ Key = "$($obj.bucket)/$($obj.key)"; Status = "failed"; Bytes = 0; Error = $_.Exception.Message }
            }
            Start-Sleep -Seconds ([math]::Pow(2, $attempt))
        }
    }
}

# --- Report --------------------------------------------------------------------

$downloaded = @($results | Where-Object { $_.Status -eq "downloaded" })
$skipped    = @($results | Where-Object { $_.Status -eq "skipped" })
$failed     = @($results | Where-Object { $_.Status -eq "failed" })
$gotBytes   = ($results | Where-Object { $_.Status -ne "failed" } | Measure-Object -Property Bytes -Sum).Sum

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ("downloaded  {0}" -f $downloaded.Count)
Write-Host ("skipped     {0}  (already present at the right size)" -f $skipped.Count)
Write-Host ("failed      {0}" -f $failed.Count) -ForegroundColor $(if ($failed.Count) { "Red" } else { "Gray" })
Write-Host ("bytes       {0:N1} MB of {1:N1} MB expected" -f ($gotBytes / 1MB), ($totalBytes / 1MB))
Write-Host "========================================" -ForegroundColor Cyan

if ($failed.Count -gt 0) {
    $failPath = Join-Path $OutDir "storage-failures.json"
    $failed | ConvertTo-Json -Depth 4 | Set-Content -Path $failPath -Encoding utf8
    Write-Host ""
    Write-Host "Failures written to $failPath" -ForegroundColor Red
    Write-Host "Rerun the script to retry just those (completed files are skipped)." -ForegroundColor Red
    $failed | Select-Object -First 10 | ForEach-Object {
        Write-Host ("  {0}: {1}" -f $_.Key, $_.Error) -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "Storage export complete: $storageDir" -ForegroundColor Green
exit 0
