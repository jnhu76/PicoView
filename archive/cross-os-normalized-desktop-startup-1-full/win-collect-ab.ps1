# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — Windows A/B re-collection with the
# quiet gate (the first A/B attempt failed on an empty -ArgumentList binding
# before running any sample; C already ran in a gated window).
$ErrorActionPreference = "SilentlyContinue"
$dir = "C:\Users\fred1\source\PicoView\evidence\tmp\cross-os-norm-1"
$log = "$dir\logs\win\machine-state-batch.txt"
$gate = $false
for ($attempt = 1; $attempt -le 8 -and -not $gate; $attempt++) {
    $samples = @()
    for ($i = 0; $i -lt 30; $i++) {
        $load = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $samples += [double]$load
        Start-Sleep -Seconds 1
    }
    $sorted = $samples | Sort-Object
    $idx = [Math]::Ceiling(0.95 * $sorted.Count) - 1
    $p95 = $sorted[$idx]
    Add-Content -Path $log -Value "AB-ATTEMPT $attempt ambient n=$($samples.Count) min=$($sorted[0]) max=$($sorted[-1]) P95=$p95 gate=$(if ($p95 -lt 20) { 'PASS' } else { 'FAIL' })"
    if ($p95 -lt 20) { $gate = $true } else { Start-Sleep -Seconds 60 }
}
if (-not $gate) {
    Add-Content -Path $log -Value "AB-QUIET-GATE-NEVER-PASSED"
    Write-Output "AB-QUIET-GATE-NEVER-PASSED"
    exit 2
}
Add-Content -Path $log -Value "AB-QUIET-GATE-PASS — batches start"
& powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\norm-run.ps1" -Arm A -N 20 -OutDir "$dir\logs\win\A"
& powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\norm-run.ps1" -Arm B -N 20 -OutDir "$dir\logs\win\B"
Write-Output "WIN-AB-COLLECTION-DONE"
