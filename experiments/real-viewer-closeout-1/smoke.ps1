# Real Viewer Train 1 closeout — Windows release smoke driver.
# Launches the release binary against A/B/C(corrupt)/D, drives keyboard
# navigation/zoom, and captures RUST_LOG. Does not claim 1:1 scale pixels;
# it proves the process survives the product sequence without crash.

param(
  [string]$Exe = "C:\Users\fred1\source\PicoView\native\target\release\picoview.exe",
  [string]$Js = "C:\Users\fred1\source\PicoView\dist\picoview.js",
  [string]$Pak = "C:\Users\fred1\source\PicoView\dist\picoview.pak",
  [string]$Media = "C:\Users\fred1\source\PicoView\experiments\real-viewer-closeout-1\smoke-media",
  [string]$Log = "C:\Users\fred1\source\PicoView\experiments\real-viewer-closeout-1\smoke.log",
  [int]$HoldSeconds = 18
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force (Split-Path $Log) | Out-Null
if (Test-Path $Log) { Remove-Item $Log -Force }

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PVWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@

$env:RUST_LOG = "info,picoview=debug"
$env:RUST_BACKTRACE = "1"
$start = Get-Date
$proc = Start-Process -FilePath $Exe `
  -ArgumentList @("--js", $Js, "--pak", $Pak, "--viewport", "960x640", (Join-Path $Media "A.jpg")) `
  -RedirectStandardError $Log `
  -PassThru
Write-Host "launched pid=$($proc.Id) at $($start.ToString('o'))"

# Wait for the window, then focus it.
$deadline = (Get-Date).AddSeconds(8)
$focused = $false
while ((Get-Date) -lt $deadline) {
  $proc.Refresh()
  $hwnd = $proc.MainWindowHandle
  if ($hwnd -ne [IntPtr]::Zero -and $hwnd -ne $null -and "$hwnd" -ne "" -and "$hwnd" -ne "0") {
    try {
      [void][PVWin32]::ShowWindow([IntPtr]$hwnd, 9) # SW_RESTORE
      Start-Sleep -Milliseconds 200
      [void][PVWin32]::SetForegroundWindow([IntPtr]$hwnd)
      Start-Sleep -Milliseconds 300
      $fg = [PVWin32]::GetForegroundWindow()
      if ($fg -eq [IntPtr]$hwnd) { $focused = $true; break }
    } catch {
      Write-Host "focus attempt failed: $_"
    }
  }
  Start-Sleep -Milliseconds 250
}
Write-Host "window_handle=$($proc.MainWindowHandle) focused=$focused"
if (-not $focused) {
  Write-Host "WARN: could not focus window; keyboard steps will be skipped"
}

function Send-Key([string]$key, [string]$label) {
  if (-not $focused) { return }
  Write-Host "key $label"
  [System.Windows.Forms.SendKeys]::SendWait($key)
  Start-Sleep -Milliseconds 350
}

if ($focused) {
  # Allow boot decode/present first.
  Start-Sleep -Milliseconds 800
  # Next -> B
  Send-Key "{RIGHT}" "Right (Next -> B)"
  # Zoom+ Zoom+
  Send-Key "{ADD}" "Plus (Zoom+)"
  Send-Key "{ADD}" "Plus (Zoom+)"
  # 1:1
  Send-Key "1" "1 (1:1)"
  # Fit
  Send-Key "0" "0 (Fit)"
  # Next -> corrupt C
  Send-Key "{RIGHT}" "Right (Next -> corrupt C)"
  # Next -> D
  Send-Key "{RIGHT}" "Right (Next -> D)"
  # Previous -> corrupt C
  Send-Key "{LEFT}" "Left (Previous -> corrupt C)"
  # Previous -> B
  Send-Key "{LEFT}" "Left (Previous -> B)"
  # Refresh
  Send-Key "r" "R (Refresh)"
  # Keyboard zoom
  Send-Key "{ADD}" "Plus (Zoom+)"
  Send-Key "{SUBTRACT}" "Minus (Zoom-)"
  # Fit again
  Send-Key "0" "0 (Fit)"
}

# Hold so the log captures post-navigation frames.
$remaining = $HoldSeconds - ((Get-Date) - $start).TotalSeconds
if ($remaining -gt 0) { Start-Sleep -Seconds ([int][Math]::Ceiling($remaining)) }

$proc.Refresh()
$alive = -not $proc.HasExited
$exitCode = if ($alive) { $null } else { $proc.ExitCode }
if ($alive) {
  Write-Host "terminating pid=$($proc.Id) after smoke hold"
  Stop-Process -Id $proc.Id -Force
  Start-Sleep -Milliseconds 400
  $proc.Refresh()
  if ($proc.HasExited) { $exitCode = $proc.ExitCode } else { $exitCode = "forced" }
}

Write-Host "SMOKE_RESULT alive_at_end_of_hold=$alive exit=$exitCode log=$Log"
if (Test-Path $Log) {
  Write-Host "---- log tail ----"
  Get-Content $Log -Tail 80
}
