# Windows Shell + UI Polish 1 — smoke driver
param(
  [string]$Exe = "C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1\native\target\release\picoview.exe",
  [string]$Js = "C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1\dist\picoview.js",
  [string]$Pak = "C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1\dist\picoview.pak",
  [string]$Media = "C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1\experiments\real-viewer-closeout-1\smoke-media",
  [string]$Log = "C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1\experiments\windows-shell-ui-polish-1\smoke.log",
  [int]$HoldSeconds = 16
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
Write-Host "launched pid=$($proc.Id)"

$deadline = (Get-Date).AddSeconds(8)
$focused = $false
while ((Get-Date) -lt $deadline) {
  $proc.Refresh()
  $hwnd = $proc.MainWindowHandle
  if ($hwnd -ne [IntPtr]::Zero -and $hwnd -ne $null -and "$hwnd" -ne "" -and "$hwnd" -ne "0") {
    try {
      [void][PVWin32]::ShowWindow([IntPtr]$hwnd, 9)
      Start-Sleep -Milliseconds 200
      [void][PVWin32]::SetForegroundWindow([IntPtr]$hwnd)
      Start-Sleep -Milliseconds 300
      if ([PVWin32]::GetForegroundWindow() -eq [IntPtr]$hwnd) { $focused = $true; break }
    } catch {}
  }
  Start-Sleep -Milliseconds 250
}
Write-Host "window_handle=$($proc.MainWindowHandle) focused=$focused"

function Send-Key([string]$key, [string]$label) {
  if (-not $focused) { return }
  Write-Host "key $label"
  [System.Windows.Forms.SendKeys]::SendWait($key)
  Start-Sleep -Milliseconds 350
}

if ($focused) {
  Start-Sleep -Milliseconds 800
  Send-Key "{RIGHT}" "Right (Next -> B)"
  Send-Key "{RIGHT}" "Right (Next -> C)"
  Send-Key "{RIGHT}" "Right (Next -> D)"
  Send-Key "{LEFT}" "Left (Previous -> C)"
  Send-Key "{LEFT}" "Left (Previous -> B)"
  Send-Key "{F5}" "F5 (Refresh)"
  Send-Key "r" "R (Refresh)"
  Send-Key "{ADD}" "Plus"
  Send-Key "{SUBTRACT}" "Minus"
  Send-Key "0" "Fit"
  Send-Key "1" "1:1"
}

$remaining = $HoldSeconds - ((Get-Date) - $start).TotalSeconds
if ($remaining -gt 0) { Start-Sleep -Seconds ([int][Math]::Ceiling($remaining)) }

$proc.Refresh()
$alive = -not $proc.HasExited
$exitCode = if ($alive) { $null } else { $proc.ExitCode }
if ($alive) {
  Stop-Process -Id $proc.Id -Force
  Start-Sleep -Milliseconds 400
  $proc.Refresh()
  if ($proc.HasExited) { $exitCode = $proc.ExitCode } else { $exitCode = "forced" }
}

Write-Host "SMOKE_RESULT alive_at_end_of_hold=$alive exit=$exitCode log=$Log"
if (Test-Path $Log) {
  Write-Host "---- key log markers ----"
  Select-String -Path $Log -Pattern 'guest svc|current item|open file|registered|panicked|ERROR' | Select-Object -Last 40
}
