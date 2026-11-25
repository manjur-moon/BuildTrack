param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
    throw "package.json not found in the provided project folder."
}
$files = @(
    "prisma\schema.prisma",
    "src\server\auth\auth.ts",
    "src\server\auth\schema-blueprint.ts",
    "src\server\auth\invitations.ts"
)
$backupRoot = Join-Path $projectRoot ("_backup_step5_auth_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
foreach ($relative in $files) {
    $source = Join-Path $patchRoot $relative
    $destination = Join-Path $projectRoot $relative
    if (-not (Test-Path -LiteralPath $source)) { throw "Patch file missing: $source" }
    if (-not (Test-Path -LiteralPath $destination)) { throw "Expected project file missing: $destination" }
}
foreach ($relative in $files) {
    $source = Join-Path $patchRoot $relative
    $destination = Join-Path $projectRoot $relative
    $backup = Join-Path $backupRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
    Copy-Item -LiteralPath $destination -Destination $backup -Force
    Copy-Item -LiteralPath $source -Destination $destination -Force
    Write-Host "UPDATED: $relative"
}
Write-Host "Backup created: $backupRoot"
Write-Host "Run npm run db:auth-schema, npm run db:auth-check, npm run db:validate and npm run db:generate from the project root."
