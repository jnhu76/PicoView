# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — Windows Vulkan-wedge retry loop.
# The AMD Windows Vulkan driver currently fails vkGetPhysicalDeviceSurface
# CapabilitiesKHR system-wide (vulkaninfo fails identically). This loop
# probes every 3 minutes (up to 15 attempts ~ 45 min): a probe that reaches
# E190 proves recovery, then the gated full collection starts immediately.
$ErrorActionPreference = "SilentlyContinue"
$dir = "C:\Users\fred1\source\PicoView\evidence\tmp\cross-os-norm-1"
$log = "$dir\logs\win\machine-state-batch.txt"
$exe = "C:\Users\fred1\source\pocketjs\hosts\desktop\target\release\pocket-desktop-host.exe"
$env:NORMTRACE = "1"
$env:POCKET_GPU_BACKEND = "VULKAN"
$env:POCKETJS_DIST = "$dir\dist-winref"
$recovered = $false
for ($i = 1; $i -le 15 -and -not $recovered; $i++) {
    $out = & $exe --app picoview-a6-main --viewport 720x480 --density 1 --quit-after 10 2>&1 |
        Select-String -Quiet "E190_FIRST_USABLE_PRESENT_SUBMITTED"
    Add-Content -Path $log -Value "RETRY-PROBE $i recovered=$out at $(Get-Date -Format o)"
    if ($out) { $recovered = $true } else { Start-Sleep -Seconds 180 }
}
if (-not $recovered) {
    Add-Content -Path $log -Value "VULKAN-WEDGE-NOT-RECOVERED in timebox"
    Write-Output "VULKAN-WEDGE-NOT-RECOVERED"
    exit 2
}
Add-Content -Path $log -Value "VULKAN-RECOVERED — gated collection starts"
& powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\win-collect-visible.ps1"
Write-Output "WIN-RETRY-COLLECTION-DONE"
