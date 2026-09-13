$ErrorActionPreference = "SilentlyContinue"
$since = (Get-Date).AddHours(-2)
Write-Output "=== Display-related events (last 2h) ==="
Get-WinEvent -FilterHashtable @{ LogName = "System"; StartTime = $since } |
    Where-Object { $_.ProviderName -match "amd|display|dxgkrnl|nvlddmkm" -or $_.Message -match "Vulkan|display driver" } |
    Select-Object -First 10 TimeCreated, ProviderName, Id, LevelDisplayName |
    Format-Table -AutoSize
Write-Output "=== Application errors (last 2h, AMD/pocket) ==="
Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = $since; Level = 2 } |
    Select-Object -First 10 TimeCreated, ProviderName, Id |
    Format-Table -AutoSize
