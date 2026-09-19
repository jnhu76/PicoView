# PicoView guest build — THE canonical source -> generated-artifact step.
#
# Layers (contract: docs/RELEASE-WINDOWS.md):
#   guest   : guest/*.ts(x)  -> dist/picoview.js + dist/picoview.pak   (this script)
#   native  : those two generated artifacts -> picoview.exe            (cargo / build.rs)
#   release : picoview.exe   -> portable zip + installer               (build-windows-release.ps1)
#
# Usage:  pwsh -NoProfile -File scripts\build-guest.ps1
#
# The compile is a plain PocketJS *external project* build run from the
# repository root: `--manifest guest/pocket.json --project-root .` with the
# project's committed module resolution in tsconfig.json. It needs no junction,
# no symlink, no PicoView-side node_modules and no edit to third_party/pocketjs.
#
# The native build consumes dist/picoview.{js,pak} as immutable generated inputs
# and never invokes Bun itself (native/build.rs only checks they exist).

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Framework = Join-Path $Root 'third_party\pocketjs'

# --- 1. vendored framework dependencies -------------------------------------
# The guest imports the framework's own runtime packages (octane, solid-js, and
# what the octane renderer pulls in). They install into the vendored framework's
# own gitignored node_modules from its committed lockfile — the same install the
# PocketJS checkout requires (`cd pocketjs && bun install`) — so app and renderer
# share exactly one copy of each runtime. Nothing is linked or copied into
# PicoView, and --frozen-lockfile makes the pinned revisions mandatory rather
# than merely preferred.
Write-Host '==> framework dependencies (bun install --frozen-lockfile)' -ForegroundColor Cyan
& bun install --frozen-lockfile --cwd $Framework
if ($LASTEXITCODE -ne 0) { throw "framework dependency install failed ($LASTEXITCODE)" }

# --- 2. guest compile --------------------------------------------------------
Write-Host '==> guest compile (pocket.ts compile --target windows-app)' -ForegroundColor Cyan
Set-Location $Root
& bun (Join-Path $Framework 'tools\pocket.ts') compile --target windows-app `
    --manifest guest/pocket.json --project-root . --outdir dist
if ($LASTEXITCODE -ne 0) { throw "guest compile failed ($LASTEXITCODE)" }

foreach ($name in @('picoview.js', 'picoview.pak')) {
    $artifact = Join-Path $Root "dist\$name"
    if (-not (Test-Path $artifact)) { throw "guest artifact missing after compile: $artifact" }
    $hash = (Get-FileHash $artifact -Algorithm SHA256).Hash.ToLower()
    Write-Host ("  dist/{0}  {1:N0} bytes  sha256={2}" -f $name, (Get-Item $artifact).Length, $hash)
}
Write-Host 'guest build complete'
