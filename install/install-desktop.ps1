[CmdletBinding()]
param(
  [string]$Profile = "desktop",
  [string]$Repo = "",
  [string]$DshHome = "",
  [string]$Dsh = "",
  [switch]$AllowDesktop,
  [switch]$Force
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

if ([string]::IsNullOrWhiteSpace($DshHome)) {
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }
}
if ([string]::IsNullOrWhiteSpace($Repo)) {
  if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    throw "Cannot determine the repository root. Pass -Repo <path>."
  }
  $Repo = Split-Path -Parent $PSScriptRoot
}
$repoRoot = (Resolve-Path $Repo).Path
$providerRoot = Join-Path $repoRoot "provider"
if (-not (Test-Path (Join-Path $providerRoot "package.json"))) {
  throw "provider package not found at $providerRoot"
}
if ($Profile -eq "desktop" -and -not $AllowDesktop) {
  throw "Refusing the desktop profile without -AllowDesktop."
}

$profilePath = Join-Path (Join-Path $DshHome "profiles") $Profile
$packagePath = Join-Path $profilePath "package.json"
if (-not (Test-Path $packagePath)) { throw "profile '$Profile' not found at $profilePath" }

$dshPath = Resolve-Dsh -Explicit $Dsh
$dshVersionOutput = & $dshPath --version 2>$null
if ($LASTEXITCODE -ne 0) { throw "cannot run dsh at $dshPath" }
$dshVersion = @($dshVersionOutput)[0]

$markerPath = Join-Path $profilePath ".antigravity-kit.json"
$pkg = Get-Content $packagePath -Raw | ConvertFrom-Json
$deps = @{}
if ($pkg.dependencies) { $pkg.dependencies.PSObject.Properties | ForEach-Object { $deps[$_.Name] = $_.Value } }
$bundles = @()
if ($pkg.dsh -and $pkg.dsh.profile -and $pkg.dsh.profile.bundles) { $bundles = @($pkg.dsh.profile.bundles) }
$already = $deps.ContainsKey("dsh-subagent-antigravity") -and $deps.ContainsKey("dsh-antigravity") -and
  ($bundles -contains "dsh-subagent-antigravity") -and ($bundles -contains "dsh-antigravity")

if ($already -and (Test-Path $markerPath) -and -not $Force) {
  Write-Host "Already installed in profile '$Profile'."
  Write-Host "Marker: $markerPath"
  exit 0
}
if ($Profile -eq "desktop" -and (Get-Process -Name "DeepSeek Harness" -ErrorAction SilentlyContinue)) {
  throw "DeepSeek Harness is running. Close it, then re-run the installer."
}

$backupRoot = Join-Path (Join-Path $DshHome "backups") "antigravity-kit"
$backupDir = Join-Path $backupRoot ("{0}-{1}" -f $Profile, (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$manifestFiles = [ordered]@{}
foreach ($name in @("package.json", "cordis.patch.yml", "pnpm-lock.yaml")) {
  $source = Join-Path $profilePath $name
  if (Test-Path $source) {
    Copy-Item $source (Join-Path $backupDir $name) -Force
    $manifestFiles[$name] = [ordered]@{ existed = $true; hash = (Get-FileHash $source -Algorithm SHA256).Hash }
  } else {
    $manifestFiles[$name] = [ordered]@{ existed = $false; hash = $null }
  }
}
$manifest = [ordered]@{
  profile = $Profile
  repo = $repoRoot
  dsh = $dshPath
  dshVersion = "$dshVersion"
  installedAt = (Get-Date).ToString("o")
  files = $manifestFiles
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $backupDir "manifest.json") -Encoding UTF8

try {
  $linkRoot = $repoRoot -replace "\\", "/"
  $linkProvider = $providerRoot -replace "\\", "/"
  & $dshPath plugin --profile $Profile add "link:$linkRoot" "link:$linkProvider"
  if ($LASTEXITCODE -ne 0) { throw "dsh plugin add failed with exit code $LASTEXITCODE" }

  $pkg2 = Get-Content $packagePath -Raw | ConvertFrom-Json
  $deps2 = @{}
  if ($pkg2.dependencies) { $pkg2.dependencies.PSObject.Properties | ForEach-Object { $deps2[$_.Name] = $_.Value } }
  $bundles2 = @($pkg2.dsh.profile.bundles)
  if (-not ($deps2.ContainsKey("dsh-subagent-antigravity") -and $deps2.ContainsKey("dsh-antigravity"))) {
    throw "dependencies missing after install"
  }
  if (-not (($bundles2 -contains "dsh-subagent-antigravity") -and ($bundles2 -contains "dsh-antigravity"))) {
    throw "bundles missing after install"
  }

  $marker = [ordered]@{
    profile = $Profile
    repo = $repoRoot
    backup = $backupDir
    installedAt = (Get-Date).ToString("o")
  }
  $marker | ConvertTo-Json -Depth 4 | Set-Content $markerPath -Encoding UTF8
  Write-Host "Installed into profile '$Profile'."
  Write-Host "Backup: $backupDir"
  Write-Host "Next: open DSH, then Settings -> Antigravity -> Sign in."
} catch {
  Write-Warning "Install failed: $($_.Exception.Message)"
  Write-Host "Restoring profile from $backupDir"
  foreach ($name in @("package.json", "cordis.patch.yml", "pnpm-lock.yaml")) {
    $target = Join-Path $profilePath $name
    $entry = $manifestFiles[$name]
    if ($entry.existed) {
      Copy-Item (Join-Path $backupDir $name) $target -Force
    } elseif (Test-Path $target) {
      Remove-Item $target -Force
    }
  }
  throw
}