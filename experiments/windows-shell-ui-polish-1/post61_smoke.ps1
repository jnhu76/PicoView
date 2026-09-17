# PICOVIEW-PR60-POST-61-INTEGRATION-1 focused smoke.
# S1 assets/hostile CWD · S8 associations · boot + keyboard geometry keys.
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1'
$exe = Join-Path $root 'native\target\release\picoview.exe'
$mediaDir = Join-Path $root 'experiments\windows-shell-ui-polish-1\post61-smoke'
New-Item -ItemType Directory -Force -Path $mediaDir | Out-Null
$out = Join-Path $mediaDir 'results.txt'
if (Test-Path $out) { Remove-Item $out -Force }

# Fixture images from existing test media if present.
$jpeg = Join-Path $root 'test-media\color-fixture.jpg'
if (-not (Test-Path $jpeg)) {
  $jpeg = Join-Path $root 'experiments\windows-shell-ui-polish-1\media with spaces\space name.jpg'
}
Copy-Item $jpeg (Join-Path $mediaDir 'a.jpg') -Force
$neighbor = Join-Path $mediaDir 'b.jpg'
Copy-Item $jpeg $neighbor -Force
$spacesJpg = Join-Path $mediaDir 'spaced name.jpg'
Copy-Item $jpeg $spacesJpg -Force

$lines = @()
function Rec($name, $ok, $detail) {
  $st = if ($ok) { 'PASS' } else { 'FAIL' }
  $script:lines += "[$st] $name — $detail"
  Write-Host "[$st] $name — $detail"
}

function Kill-Proc($p) {
  if ($p -and -not $p.HasExited) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
  }
}

Get-Process picoview -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

# --- S1: no --js/--pak, non-project CWD ---
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList @("`"$jpeg`"") -PassThru
$alive = -not $p.WaitForExit(6000)
Rec 'S1 image from %TEMP% no --js/--pak' $alive "pid=$($p.Id) alive=$alive"
Kill-Proc $p

$p = Start-Process -FilePath $exe -WorkingDirectory 'C:\' -PassThru
$alive = -not $p.WaitForExit(6000)
Rec 'S1 empty from C:\ no --js/--pak' $alive "pid=$($p.Id) alive=$alive"
Kill-Proc $p

$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList @("`"$spacesJpg`"") -PassThru
$alive = -not $p.WaitForExit(6000)
Rec 'S1 spaced path from %TEMP%' $alive "path=$spacesJpg"
Kill-Proc $p

# Explicit --js/--pak still work (developer override).
$js = Join-Path $root 'dist\picoview.js'
$pak = Join-Path $root 'dist\picoview.pak'
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList @('--js', "`"$js`"", '--pak', "`"$pak`"", "`"$jpeg`"") -PassThru
$alive = -not $p.WaitForExit(6000)
Rec 'S1 explicit --js/--pak override' $alive "pid=$($p.Id)"
Kill-Proc $p

# --- S8: associations register / inspect / unregister ---
function Invoke-ShellAction([string[]]$argList) {
  $p = Start-Process -FilePath $exe -ArgumentList $argList -Wait -PassThru -WindowStyle Hidden
  return $p.ExitCode
}

$reg = Invoke-ShellAction @('--register-associations')
Rec 'S8 register exit' ($reg -eq 0) "exit=$reg"

$prog = Get-Item -Path 'HKCU:\Software\Classes\PicoView.Image' -ErrorAction SilentlyContinue
$cmd = $null
if ($prog) { $cmd = (Get-ItemProperty -Path 'HKCU:\Software\Classes\PicoView.Image\shell\open\command' -ErrorAction SilentlyContinue).'(default)' }
Rec 'S8 ProgID command quoted' ([bool]($cmd -and $cmd -match '"[^"]+" "%1"')) "cmd=$cmd"

$exts = @('.jpg','.jpeg','.png','.bmp')
$gif = @('.gif','.webp')
$openWithOk = $true
$defaultSeized = $false
foreach ($e in $exts) {
  $ow = Get-Item -Path "HKCU:\Software\Classes\$e\OpenWithProgids" -ErrorAction SilentlyContinue
  if (-not $ow -or -not (Get-ItemProperty -Path "HKCU:\Software\Classes\$e\OpenWithProgids" -Name 'PicoView.Image' -ErrorAction SilentlyContinue)) {
    $openWithOk = $false
  }
  $def = (Get-ItemProperty -Path "HKCU:\Software\Classes\$e" -Name '(default)' -ErrorAction SilentlyContinue).'(default)'
  if ($def -eq 'PicoView.Image') { $defaultSeized = $true }
}
Rec 'S8 OpenWithProgids jpg/jpeg/png/bmp' $openWithOk "ok=$openWithOk"
Rec 'S8 no extension default seized' (-not $defaultSeized) "seized=$defaultSeized"

$gifPresent = $false
foreach ($e in $gif) {
  $ow = Get-ItemProperty -Path "HKCU:\Software\Classes\$e\OpenWithProgids" -Name 'PicoView.Image' -ErrorAction SilentlyContinue
  if ($ow) { $gifPresent = $true }
}
Rec 'S8 gif/webp not associated' (-not $gifPresent) "present=$gifPresent"

$ra = Get-ItemProperty -Path 'HKCU:\Software\RegisteredApplications' -Name 'PicoView' -ErrorAction SilentlyContinue
Rec 'S8 no RegisteredApplications write' (-not $ra) "value=$($ra.PicoView)"

$unreg = Invoke-ShellAction @('--unregister-associations')
Rec 'S8 unregister exit' ($unreg -eq 0) "exit=$unreg"
$progAfter = Get-Item -Path 'HKCU:\Software\Classes\PicoView.Image' -ErrorAction SilentlyContinue
$owAfter = Get-ItemProperty -Path 'HKCU:\Software\Classes\.jpg\OpenWithProgids' -Name 'PicoView.Image' -ErrorAction SilentlyContinue
Rec 'S8 unregister removes ProgID/OpenWith' ((-not $progAfter) -and (-not $owAfter)) "prog=$([bool]$progAfter) ow=$([bool]$owAfter)"

# --- S5-lite: boot with image + keyboard geometry keys (Fit/1:1/zoom) ---
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PVWin32B {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList @("`"$jpeg`"") -PassThru
$focused = $false
$deadline = (Get-Date).AddSeconds(8)
while ((Get-Date) -lt $deadline) {
  $p.Refresh()
  $hwnd = $p.MainWindowHandle
  if ($hwnd -ne [IntPtr]::Zero) {
    try {
      [void][PVWin32B]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
      [void][PVWin32B]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
      [void][PVWin32B]::SetForegroundWindow([IntPtr]$hwnd)
      Start-Sleep -Milliseconds 200
      if ([PVWin32B]::GetForegroundWindow() -eq [IntPtr]$hwnd) { $focused = $true; break }
    } catch {}
  }
  Start-Sleep -Milliseconds 250
}
Rec 'S5 keyboard focus window' $focused "hwnd=$($p.MainWindowHandle) focused=$focused"
if ($focused) {
  Start-Sleep -Milliseconds 600
  foreach ($k in @('0','1','{ADD}','{SUBTRACT}','{RIGHT}','{LEFT}','r')) {
    [System.Windows.Forms.SendKeys]::SendWait($k)
    Start-Sleep -Milliseconds 250
  }
  $p.Refresh()
  $alive = -not $p.HasExited
  Rec 'S5 geometry/nav keys no crash' $alive "alive=$alive after Fit/1:1/zoom/nav/refresh"
} else {
  Rec 'S5 geometry/nav keys no crash' $false 'window never focused'
}
Kill-Proc $p

$lines | Set-Content -Path $out -Encoding UTF8
Write-Host "--- written $out ---"
Get-Content $out
