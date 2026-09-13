# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — Windows batch runner.
# Usage: norm-run.ps1 -Arm A|B|C -N <count> -OutDir <dir>
# One process per sample; NORMTRACE stderr captured per run; spawn->exit wall
# time recorded (DESCRIPTIVE ONLY — never used for internal stage math).
param(
    [Parameter(Mandatory = $true)][ValidateSet("A", "B", "C")][string]$Arm,
    [Parameter(Mandatory = $true)][int]$N,
    [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = "Stop"
$hostBin = "C:\Users\fred1\source\pocketjs\hosts\desktop\target\release\pocket-desktop-host.exe"
$binA = "C:\Users\fred1\source\pocketjs\hosts\desktop\target\release\examples\norm-a.exe"
$binB = "C:\Users\fred1\source\pocketjs\hosts\desktop\target\release\examples\norm-b.exe"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Normalized policy (identical on Linux runner):
$env:NORMTRACE = "1"
$env:POCKET_GPU_BACKEND = "VULKAN"
$env:POCKET_FORCE_SCALE = "1.0"
# Guest artifacts: BOTH hosts run bundles built by ONE toolchain state
# (bun 1.4.2 on Linux from bun.lock @ PocketJS 50e3ed8e); only the embedded
# per-target resolution differs (windows-app here / linux-app on Linux).
$env:POCKETJS_DIST = "C:\Users\fred1\source\PicoView\evidence\tmp\cross-os-norm-1\dist-winref"

$exe = $binA
$argList = @()
if ($Arm -eq "B") { $exe = $binB }
if ($Arm -eq "C") {
    $exe = $hostBin
    $argList = @("--app", "picoview-a6-main", "--viewport", "720x480", "--density", "1", "--quit-after", "30")
}

for ($i = 0; $i -lt $N; $i++) {
    # Quiet gate: refuse to run under build activity.
    $busy = Get-Process -Name cargo, rustc -ErrorAction SilentlyContinue
    if ($busy) { Write-Output "run-$i SKIPPED_BUSY_BUILD"; Start-Sleep -Seconds 5; $i--; continue }
    $env:NORMTRACE_RUN = "$i"
    $log = Join-Path $OutDir ("run-{0:d3}.log" -f $i)
    $out = Join-Path $OutDir ("run-{0:d3}.out" -f $i)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $argString = ($argList -join " ")
    # NO -WindowStyle Hidden: hidden HWNDs make the wgpu Vulkan surface
    # incompatible ("vulkan not compatible with provided surface") and
    # suppress redraw delivery — a methodology artifact, not product
    # behavior. Windows are shown, exactly like the Linux/KWin arm.
    $p = Start-Process -FilePath $exe -ArgumentList $argString -RedirectStandardError $log -RedirectStandardOutput $out -PassThru
    $p.WaitForExit()
    $sw.Stop()
    Add-Content -Path $log -Value "WALL_SPAWN_EXIT_MS=$($sw.ElapsedMilliseconds),exitcode=$($p.ExitCode)"
    Start-Sleep -Milliseconds 500
}
Write-Output "BATCH-DONE arm=$Arm n=$N outdir=$OutDir"
