# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — Windows collection, VISIBLE windows.
# REVIEW-1 MINOR fixes applied: a FRESH 30 s ambient observation is taken
# before EACH headline batch (A, B, C), and the ambient P95 uses the same
# linear-interpolation convention as the headline percentiles. The declared
# gate threshold is unchanged (P95 < 20%). The prior attempt's hidden-window
# samples remain INVALID_ENVIRONMENT under logs/win/C-invalid-hidden/.
$ErrorActionPreference = "SilentlyContinue"
$dir = "C:\Users\fred1\source\PicoView\evidence\tmp\cross-os-norm-1"
$log = "$dir\logs\win\machine-state-batch.txt"

function Test-AmbientGate([string]$tag) {
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $samples = @()
        for ($i = 0; $i -lt 30; $i++) {
            $load = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
            $samples += [double]$load
            Start-Sleep -Seconds 1
        }
        $sorted = $samples | Sort-Object
        # linear-interpolation P95 (same convention as parse_norm.py)
        $k = 0.95 * ($sorted.Count - 1)
        $f = [Math]::Floor($k)
        $c = [Math]::Min($f + 1, $sorted.Count - 1)
        $p95 = $sorted[$f] + ($sorted[$c] - $sorted[$f]) * ($k - $f)
        Add-Content -Path $log -Value "$tag attempt $attempt ambient n=$($samples.Count) min=$($sorted[0]) max=$($sorted[-1]) P95(lin)=$([math]::Round($p95,2)) gate=$(if ($p95 -lt 20) { 'PASS' } else { 'FAIL' })"
        if ($p95 -lt 20) { return $true }
        Start-Sleep -Seconds 60
    }
    return $false
}

if (-not (Test-AmbientGate "VERIFY")) {
    Add-Content -Path $log -Value "VISIBLE-QUIET-GATE-NEVER-PASSED (verify)"
    Write-Output "VISIBLE-QUIET-GATE-NEVER-PASSED"
    exit 2
}

# One verification sample before the headline batches: the C arm must reach
# its endpoint with a visible window (guards the hidden-window regression).
$verify = "$dir\logs\win\verify-visible"
New-Item -ItemType Directory -Force -Path $verify | Out-Null
& powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\norm-run.ps1" -Arm C -N 1 -OutDir $verify
$verifyLog = Get-Content "$verify\run-000.log" -ErrorAction SilentlyContinue
if (-not ($verifyLog | Select-String -Quiet "E190_FIRST_USABLE_PRESENT_SUBMITTED")) {
    Add-Content -Path $log -Value "VERIFY-SAMPLE-FAILED — batches NOT started"
    Write-Output "VERIFY-SAMPLE-FAILED"
    exit 3
}
Add-Content -Path $log -Value "VERIFY-SAMPLE-OK — headline batches start"

foreach ($arm in @("A", "B", "C")) {
    if (-not (Test-AmbientGate "BATCH-$arm")) {
        Add-Content -Path $log -Value "BATCH-$arm GATE-NEVER-PASSED — SKIPPED"
        Write-Output "BATCH-$arm-GATE-FAILED"
        exit 4
    }
    $n = 20
    if ($arm -eq "C") { $n = 50 }
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\norm-run.ps1" -Arm $arm -N $n -OutDir "$dir\logs\win\$arm"
}
Write-Output "WIN-VISIBLE-COLLECTION-DONE"
