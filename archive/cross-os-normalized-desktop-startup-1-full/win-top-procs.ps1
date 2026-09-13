Get-Process | Sort-Object CPU -Descending |
    Select-Object -First 14 Name,
    @{n = 'CPU_s'; e = { [math]::Round($_.CPU, 0) } },
    @{n = 'WS_MB'; e = { [math]::Round($_.WorkingSet64 / 1MB, 0) } } |
    Format-Table -AutoSize
