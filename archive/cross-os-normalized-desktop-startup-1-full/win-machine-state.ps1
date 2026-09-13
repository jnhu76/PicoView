$ErrorActionPreference = "SilentlyContinue"
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$cores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$cs = Get-CimInstance Win32_ComputerSystem
$ram = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
$os = Get-CimInstance Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$uptimeH = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
Write-Output "OS: $($os.Caption) build $($os.BuildNumber)"
Write-Output "CPU: $cpu ($cores logical)"
Write-Output "RAM_GB_total: $ram  RAM_GB_free: $freeGB"
Write-Output "Uptime_hours: $uptimeH"
Get-CimInstance Win32_VideoController | ForEach-Object {
    Write-Output ("GPU: {0} | driver {1} | {2}x{3} @ {4}Hz" -f $_.Name, $_.DriverVersion, $_.CurrentHorizontalResolution, $_.CurrentVerticalResolution, $_.CurrentRefreshRate)
}
$dpi = (Get-ItemProperty 'HKCU:\Control Panel\Desktop\WindowMetrics').AppliedDPI
Write-Output "AppliedDPI: $dpi (= $([math]::Round($dpi / 96, 2))x)"
$load = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Sum).Sum
Write-Output "CPU_load_pct_now: $load"
$av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | ForEach-Object { $_.displayName }
Write-Output "AV_registered: $($av -join ', ')"
$defender = (Get-Service WinDefender).Status
$qqp = (Get-Service QQPCRTP -ErrorAction SilentlyContinue).Status
Write-Output "WinDefender_service: $defender  QQPCRTP_service: $qqp"
$builds = Get-Process -Name cargo,rustc,cargo.exe,rustc.exe -ErrorAction SilentlyContinue
Write-Output "build_processes: $(if ($builds) { 'YES' } else { 'NONE' })"
