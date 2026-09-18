# PR62 smoke: launch picoview, wait for a real client, capture PNG via GDI.
param(
  [string]$Exe = "C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1\native\target\release\picoview.exe",
  [string]$Js = "C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1\dist\picoview.js",
  [string]$Pak = "C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1\dist\picoview.pak",
  [string]$MediaA = "C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1\experiments\real-viewer-closeout-1\smoke-media\A.jpg",
  [string]$MediaB = "C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1\experiments\real-viewer-closeout-1\smoke-media\B.jpg",
  [string]$OutDir = "C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1\experiments\desktop-ui-normalization-1\screenshots"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PVShot {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT pt);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
"@

function Find-ProcWindow([int]$procId) {
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $p) { return [IntPtr]::Zero }
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero -and [PVShot]::IsWindowVisible($p.MainWindowHandle)) {
    return $p.MainWindowHandle
  }
  return [IntPtr]::Zero
}

function Wait-Window([int]$procId, [int]$seconds = 10) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    $h = Find-ProcWindow $procId
    if ($h -ne [IntPtr]::Zero) {
      $rc = New-Object PVShot+RECT
      if ([PVShot]::GetClientRect($h, [ref]$rc)) {
        $w = $rc.Right - $rc.Left
        $ht = $rc.Bottom - $rc.Top
        if ($w -ge 320 -and $ht -ge 240) { return $h }
      }
    }
    Start-Sleep -Milliseconds 200
  }
  return [IntPtr]::Zero
}

function Capture-Window([IntPtr]$hwnd, [string]$path) {
  [void][PVShot]::ShowWindow($hwnd, 9)
  Start-Sleep -Milliseconds 200
  [void][PVShot]::SetForegroundWindow($hwnd)
  Start-Sleep -Milliseconds 400
  $rc = New-Object PVShot+RECT
  if (-not [PVShot]::GetClientRect($hwnd, [ref]$rc)) { throw "GetClientRect failed" }
  $w = $rc.Right - $rc.Left
  $h = $rc.Bottom - $rc.Top
  if ($w -lt 100 -or $h -lt 100) { throw "client too small ${w}x${h}" }
  # PrintWindow PW_RENDERFULLCONTENT=2 captures this window only (no occlusion).
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  try {
    $ok = [PVShot]::PrintWindow($hwnd, $hdc, 2)
    if (-not $ok) { throw "PrintWindow failed" }
  } finally {
    $g.ReleaseHdc($hdc)
    $g.Dispose()
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "saved $path ${w}x${h}"
}

function Invoke-Case([string]$label, [string[]]$AppArgs, [double]$settle = 2.2) {
  $log = Join-Path $OutDir "$label.log"
  $shot = Join-Path $OutDir "$label.png"
  if (Test-Path $log) { Remove-Item $log -Force }
  $env:RUST_LOG = "info,picoview=debug"
  $argList = @()
  foreach ($a in $AppArgs) { if ($null -ne $a -and "$a" -ne "") { $argList += "$a" } }
  $proc = Start-Process -FilePath $Exe -ArgumentList $argList -RedirectStandardError $log -PassThru
  Write-Host "launched $label pid=$($proc.Id)"
  try {
    $hwnd = Wait-Window $proc.Id 12
    if ($hwnd -eq [IntPtr]::Zero) {
      $proc.Refresh()
      throw "no sized window for $label exit=$($proc.HasExited) code=$($proc.ExitCode)"
    }
    Start-Sleep -Seconds $settle
    Capture-Window $hwnd $shot
  } finally {
    if (-not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 400
    }
  }
}

$common = @("--js", $Js, "--pak", $Pak, "--viewport", "960x640")
Invoke-Case "A-image-ready" ($common + @($MediaA))
Invoke-Case "B-image-b" ($common + @($MediaB))
Invoke-Case "C-empty" $common 1.5
Write-Host "SMOKE_SHOTS_OK dir=$OutDir"
Get-ChildItem $OutDir | Select-Object Name,Length
