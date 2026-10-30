[CmdletBinding()]
param(
  [string]$Profile = "desktop",
  [string]$DshHome = "",
  [string]$Dsh = "",
  [string]$Backup = "",
  [switch]$AllowDesktop
)

$ErrorActionPreference = "Stop"

function Resolve-Dsh {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return (Resolve-Path $Explicit).Path }
  if ($env:DSH_CLI -and (Test-Path $env:DSH_CLI)) { return (Resolve-Path $env:DSH_CLI).Path }
  $cmd = Get-Command dsh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $bundled = "D:\DeepSeek\resources\runtime\cli\bin\dsh.cmd"
  if (Test-Path $bundled) { return $bundled }
  throw "dsh CLI not found. Pass -Dsh <path to dsh.cmd> or set DSH_CLI."
}

function Invoke-ProfilePnpmInstall {
  param([string]$ProfilePath, [string]$DshExecutable)
  $runtimeRoot = Split-Path (Split-Path (Split-Path $DshExecutable -Parent) -Parent) -Parent
  $nodeExe = Join-Path $runtimeRoot "primary-runtime\dependencies\node\bin\node.exe"
  $pnpmCjs = Join-Path $runtimeRoot "primary-runtime\dependencies\pnpm\bin\pnpm.cjs"
  Push-Location $ProfilePath
  try {
    if ((Test-Path $nodeExe) -and (Test-Path $pnpmCjs)) {
      & $nodeExe $pnpmCjs install
    } else {
      & pnpm install
    }
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

if ([string]::IsNullOrWhiteSpace($DshHome)) {
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }
}
if ($Profile -eq "desktop" -and -not $AllowDesktop) {
  throw "Refusing the desktop profile without -AllowDesktop."
}
$profilePath = Join-Path (Join-Path $DshHome "profiles") $Profile
if (-not (Test-Path (Join-Path $profilePath "package.json"))) {
  throw "profile '$Profile' not found at $profilePath"
}
if ($Profile -eq "desktop" -and (Get-Process -Name "DeepSeek Harness" -ErrorAction SilentlyContinue)) {
  throw "DeepSeek Harness is running. Close it, then re-run the rollback."
}

$markerPath = Join-Path $profilePath ".antigravity-kit.json"
if (-not $Backup) {
  if (Test-Path $markerPath) {
    $marker = Get-Content $markerPath -Raw | ConvertFrom-Json
    $Backup = $marker.backup
  } else {
    $backupRoot = Join-Path (Join-Path $DshHome "backups") "antigravity-kit"
    if (Test-Path $backupRoot) {
      $latest = Get-ChildItem $backupRoot -Directory -Filter "$Profile-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
      if ($latest) { $Backup = $latest.FullName }
    }
  }
}
if (-not $Backup -or -not (Test-Path (Join-Path $Backup "manifest.json"))) {
  throw "No backup found for profile '$Profile'. Pass -Backup <directory>."
}

$manifest = Get-Content (Join-Path $Backup "manifest.json") -Raw | ConvertFrom-Json
if ($manifest.profile -ne $Profile) {
  throw "Backup at $Backup belongs to profile '$($manifest.profile)', not '$Profile'."
}

foreach ($entry in $manifest.files.PSObject.Properties) {
  $name = $entry.Name
  $info = $entry.Value
  $target = Join-Path $profilePath $name
  if ($info.existed) {
    $source = Join-Path $Backup $name
    if (-not (Test-Path $source)) { throw "backup file missing: $source" }
    Copy-Item $source $target -Force
    $hash = (Get-FileHash $target -Algorithm SHA256).Hash
    if ($hash -ne $info.hash) { throw "hash mismatch after restore: $name" }
    Write-Host "restored $name"
  } elseif (Test-Path $target) {
    Remove-Item $target -Force
    Write-Host "removed $name (did not exist before install)"
  }
}

$dshPath = Resolve-Dsh -Explicit $Dsh
Invoke-ProfilePnpmInstall -ProfilePath $profilePath -DshExecutable $dshPath

Remove-Item $markerPath -Force -ErrorAction SilentlyContinue
Write-Host "Rolled back profile '$Profile' from $Backup"
Write-Host "Next: open DSH; both Antigravity bundles should be gone."