$ErrorActionPreference = "SilentlyContinue"
for ($i = 0; $i -lt 30; $i++) {
    $load = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    Write-Output "$load"
    Start-Sleep -Seconds 1
}
