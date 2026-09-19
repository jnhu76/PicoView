# PicoView Windows release build — one authoritative entrypoint.
#
# Orchestration only: this script runs the canonical build commands and stages
# release artifacts. It creates no junctions or symlinks, performs no
# node_modules surgery to fake module resolution, and does not edit
# third_party/pocketjs sources. The single dependency install in the whole path
# is delegated to scripts/build-guest.ps1, which restores the vendored
# framework's own pinned dependencies into its gitignored node_modules — no
# PicoView-side or repository-root node_modules is created or modified.
#
# Layers (contract: docs/RELEASE-WINDOWS.md):
#   guest   : guest/*.ts(x) -> dist/picoview.js + dist/picoview.pak   (scripts/build-guest.ps1)
#   native  : those generated artifacts -> picoview.exe               (cargo / build.rs)
#   release : picoview.exe  -> portable zip + installer               (this script)
#
# Produces, under dist-release/:
#   PicoView-<version>-windows-x64-portable.zip
#   PicoView-<version>-windows-x64-setup.exe
# plus SHA-256 integrity hashes printed at the end.
#
# Usage:  powershell -NoProfile -File scripts\build-windows-release.ps1
#         [-SkipTests] [-Iscc <path-to-ISCC.exe>]
#
# Windows PowerShell 5.1 is the validated shell for this release. PowerShell 7
# is an equivalent optional spelling (`pwsh -NoProfile -File ...`) that is not
# validated here.
# (No execution-policy bypass is needed or documented: -File runs the script
# under the machine's policy.)
#
# Version authority: native/Cargo.toml package version (the same value baked
# into the EXE VERSIONINFO by build.rs and read by the installer script).

param(
    [switch]$SkipTests,
    [string]$Iscc = ""
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Step($msg) { Write-Host ("==> " + $msg) -ForegroundColor Cyan }

# --- version authority ------------------------------------------------------
$cargoToml = Get-Content "$Root\native\Cargo.toml" -Raw
if ($cargoToml -notmatch '(?m)^\s*version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"') {
    throw "cannot read package version from native/Cargo.toml"
}
$Version = $Matches[1]
Write-Host "PicoView version (native/Cargo.toml): $Version"

# --- 1. guest build -----------------------------------------------------------
Step "guest build"
& (Join-Path $PSScriptRoot "build-guest.ps1")
if ($LASTEXITCODE -ne 0) { throw "guest build failed ($LASTEXITCODE)" }

# --- 2. native release build ---------------------------------------------------
Step "cargo build --release"
Push-Location "$Root\native"
cargo build --release
if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
Pop-Location
$Exe = "$Root\native\target\release\picoview.exe"
if (-not (Test-Path $Exe)) { throw "release exe missing: $Exe" }

# --- 3. tests -------------------------------------------------------------------
if (-not $SkipTests) {
    Step "bun test guest/"
    bun test guest/
    if ($LASTEXITCODE -ne 0) { throw "guest tests failed ($LASTEXITCODE)" }

    Step "cargo test --release"
    Push-Location "$Root\native"
    cargo test --release
    if ($LASTEXITCODE -ne 0) { throw "native tests failed ($LASTEXITCODE)" }
    Pop-Location
} else {
    Step "tests skipped (-SkipTests)"
}

# --- 4. portable zip -------------------------------------------------------------
Step "stage portable payload"
$OutDir = "$Root\dist-release"
$Stage = "$OutDir\portable-stage"
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path "$Stage\PicoView" -Force | Out-Null
# Runtime payload is the single EXE: guest JS/PAK are embedded at compile time.
Copy-Item $Exe "$Stage\PicoView\picoview.exe"

Step "portable zip"
$Zip = "$OutDir\PicoView-$Version-windows-x64-portable.zip"
if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path "$Stage\PicoView" -DestinationPath $Zip -CompressionLevel Optimal
Remove-Item $Stage -Recurse -Force

# --- 5. installer -----------------------------------------------------------------
Step "installer (Inno Setup)"
if ($Iscc -eq "") {
    foreach ($cand in @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )) {
        if (Test-Path $cand) { $Iscc = $cand; break }
    }
}
if ($Iscc -eq "" -or -not (Test-Path $Iscc)) {
    throw "ISCC.exe not found; install Inno Setup 6 or pass -Iscc <path>"
}
& $Iscc "/DAppVersion=$Version" "$Root\packaging\windows\picoview-setup.iss"
if ($LASTEXITCODE -ne 0) { throw "installer compile failed ($LASTEXITCODE)" }
$Setup = "$OutDir\PicoView-$Version-windows-x64-setup.exe"
if (-not (Test-Path $Setup)) { throw "installer output missing: $Setup" }

# --- 6. artifacts -------------------------------------------------------------------
Step "artifacts"
foreach ($f in @($Zip, $Setup)) {
    $item = Get-Item $f
    $hash = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
    Write-Host ("  {0}  {1:N0} bytes  sha256={2}" -f $item.Name, $item.Length, $hash)
}
Write-Host ""
Write-Host "release build complete: version $Version"
