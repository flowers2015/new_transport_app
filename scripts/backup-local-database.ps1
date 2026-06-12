# Full local database backup (SQL format)
# Run from project root:
#   powershell -ExecutionPolicy Bypass -File scripts\backup-local-database.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "backend\.env"
$outDir = Join-Path $root "backups"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: backend\.env not found" -ForegroundColor Red
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        Set-Item -Path "env:$name" -Value $value
    }
}

$dbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "transport_app" }
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$dbPassword = $env:DB_PASSWORD

if (-not $dbPassword) {
    Write-Host "ERROR: DB_PASSWORD is empty in backend\.env" -ForegroundColor Red
    exit 1
}

$pgDumpCandidates = @(
    "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
)

$pgDump = $pgDumpCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $pgDump) {
    $pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
}
if (-not $pgDump) {
    Write-Host "ERROR: pg_dump not found. Install PostgreSQL client tools." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$sqlFile = Join-Path $outDir "transport_app_full_$timestamp.sql"

$env:PGPASSWORD = $dbPassword

Write-Host "Creating SQL backup (schema + data)..." -ForegroundColor Cyan
& $pgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlFile --encoding=UTF8
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

$sqlSizeMb = [math]::Round((Get-Item $sqlFile).Length / 1MB, 2)

Write-Host ""
Write-Host "Backup ready:" -ForegroundColor Green
Write-Host ("  {0} ({1} MB)" -f $sqlFile, $sqlSizeMb)
Write-Host ""
Write-Host "Copy to server (example):" -ForegroundColor Yellow
Write-Host ("  scp ""{0}"" fms@FMS-Mihan:/home/fms/" -f $sqlFile)
