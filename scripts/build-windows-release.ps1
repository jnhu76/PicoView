# PicoView Windows release build — one authoritative entrypoint.
#
# Pipeline: guest compile -> cargo release -> tests -> portable zip -> installer.
# Produces, under dist-release/:
#   PicoView-<version>-windows-x64-portable.zip
#   PicoView-<version>-windows-x64-setup.exe
# plus SHA-256 integrity hashes printed at the end.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build-windows-release.ps1
#         [-SkipTests] [-Iscc <path-to-ISCC.exe>]
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

# --- 1. guest compile ---------------------------------------------------------
# pocket.ts must run from the PocketJS subtree root (tsconfig module mappings).
# The guest junction is sanctioned local scaffolding (gitignored); created and
# removed per build so nothing depends on prior machine state.
Step "guest compile (pocket.ts, windows-app)"
$Junction = "$Root\third_party\pocketjs\guest"
$Created = $false
if (-not (Test-Path $Junction)) {
    cmd /c "mklink /J `"$Junction`" `"$Root\guest`"" | Out-Null
    $Created = $true
}
try {
    Push-Location "$Root\third_party\pocketjs"
    bun tools/pocket.ts compile --target windows-app --manifest guest/pocket.json `
        --project-root . --outdir ../../dist
    if ($LASTEXITCODE -ne 0) { throw "guest compile failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
    if ($Created -and (Test-Path $Junction)) { cmd /c "rmdir `"$Junction`"" | Out-Null }
}

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
    # guest tests import "@pocketjs/framework/*" — resolved through the
    # gitignored local node_modules junction into the in-tree subtree
    # (same sanctioned scaffolding pattern as the guest compile junction).
    $Link = "$Root\node_modules\@pocketjs\framework"
    $CreatedLink = $false
    if (-not (Test-Path $Link)) {
        New-Item -ItemType Directory -Path "$Root\node_modules\@pocketjs" -Force | Out-Null
        cmd /c "mklink /J `"$Link`" `"$Root\third_party\pocketjs`"" | Out-Null
        $CreatedLink = $true
    }
    try {
        bun test guest/
        if ($LASTEXITCODE -ne 0) { throw "guest tests failed ($LASTEXITCODE)" }
    } finally {
        if ($CreatedLink) { cmd /c "rmdir `"$Link`"" | Out-Null }
    }
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
