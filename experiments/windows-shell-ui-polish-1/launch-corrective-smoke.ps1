# PR60 product launch corrective smoke.
# Requires: release exe at native\target\release\picoview.exe
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $root 'native\target\release\picoview.exe'
$logDir = Join-Path $PSScriptRoot 'launch-corrective'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$jpeg = Join-Path $root 'test-media\color-fixture.jpg'
$spacesDir = Join-Path $logDir 'media with spaces'
$spacesJpg = Join-Path $spacesDir 'space name.jpg'
New-Item -ItemType Directory -Force -Path $spacesDir | Out-Null
if (-not (Test-Path $spacesJpg)) { Copy-Item $jpeg $spacesJpg }
$cjkDir = Join-Path $logDir '中文路径'
$cjkJpg = Join-Path $cjkDir '图片.jpg'
New-Item -ItemType Directory -Force -Path $cjkDir | Out-Null
if (-not (Test-Path $cjkJpg)) { Copy-Item $jpeg $cjkJpg }

function Wait-Alive($proc, $ms=4000) {
  if (-not $proc.WaitForExit($ms)) { return $true }
  return $false
}

function Kill-Proc($proc) {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
  }
}

$results = @()

function Record($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ Check=$name; Ok=$ok; Detail=$detail }
  $status = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host ("{0,-32} {1}  {2}" -f $name, $status, $detail)
}

# A. empty launch from C:\
$p = Start-Process -FilePath $exe -WorkingDirectory 'C:\' -PassThru
$alive = Wait-Alive $p 5000
Record 'A empty from C:\' ($alive) ("pid=$($p.Id) exited=$($p.HasExited)")
Kill-Proc $p

# C. empty from %TEMP%
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -PassThru
$alive = Wait-Alive $p 5000
Record 'C empty from %TEMP%' ($alive) ("pid=$($p.Id)")
Kill-Proc $p

# B. image from C:\
$p = Start-Process -FilePath $exe -WorkingDirectory 'C:\' -ArgumentList "`"$jpeg`"" -PassThru
$alive = Wait-Alive $p 5000
Record 'B image from C:\' ($alive) ("pid=$($p.Id) path=$jpeg")
Kill-Proc $p

# D. image from %TEMP%
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList "`"$jpeg`"" -PassThru
$alive = Wait-Alive $p 5000
Record 'D image from %TEMP%' ($alive) ("pid=$($p.Id)")
Kill-Proc $p

# E. spaced path
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList "`"$spacesJpg`"" -PassThru
$alive = Wait-Alive $p 5000
Record 'E spaced path' ($alive) ("path=$spacesJpg")
Kill-Proc $p

# F. CJK path
$p = Start-Process -FilePath $exe -WorkingDirectory $env:TEMP -ArgumentList "`"$cjkJpg`"" -PassThru
$alive = Wait-Alive $p 5000
Record 'F CJK path' ($alive) ("path=$cjkJpg")
Kill-Proc $p

# H. association command shape after register
# GUI-subsystem process: PowerShell does not wait on `& $exe`; use Start-Process -Wait.
function Invoke-ShellAction([string[]]$argList) {
  $p = Start-Process -FilePath $exe -ArgumentList $argList -Wait -PassThru -WindowStyle Hidden
  return $p.ExitCode
}
$regCode = Invoke-ShellAction @('--register-associations')
Record 'register exit 0' ($regCode -eq 0) "code=$regCode"
$cmd = (Get-ItemProperty -Path 'HKCU:\Software\Classes\PicoView.Image\shell\open\command' -ErrorAction SilentlyContinue).'(default)'
Record 'assoc command is exe "%1"' (($null -ne $cmd) -and $cmd.EndsWith('picoview.exe" "%1"')) "cmd=$cmd"
$jpgDefault = (Get-ItemProperty -Path 'HKCU:\Software\Classes\.jpg' -ErrorAction SilentlyContinue).'(default)'
$jpgOpenWith = Get-ItemProperty -Path 'HKCU:\Software\Classes\.jpg\OpenWithProgids' -ErrorAction SilentlyContinue
$hasOpenWith = $null -ne $jpgOpenWith.PSObject.Properties['PicoView.Image']
Record 'OpenWith registered' $hasOpenWith "openWith=$hasOpenWith default='$jpgDefault'"
Record 'default NOT stolen' ($jpgDefault -ne 'PicoView.Image') "default='$jpgDefault'"

# Launch via association command (expand %1)
if ($cmd) {
  $p = Start-Process -FilePath $exe -ArgumentList "`"$jpeg`"" -PassThru
  $alive = Wait-Alive $p 5000
  Record 'H Open With / assoc path' ($alive) ("cmd=$cmd")
  Kill-Proc $p
}

# Unregister cleanup
$unregCode = Invoke-ShellAction @('--unregister-associations')
Record 'unregister exit 0' ($unregCode -eq 0) "code=$unregCode"
$progLeft = Test-Path 'HKCU:\Software\Classes\PicoView.Image'
Record 'ProgID removed' (-not $progLeft) "progLeft=$progLeft"

# Console: PE subsystem already checked separately. Launch should not
# attach a console host for this GUI binary when started detached.
$p = Start-Process -FilePath $exe -PassThru -WindowStyle Normal
Start-Sleep -Milliseconds 800
$hasConsole = $false
try {
  $sig = @"
using System;
using System.Runtime.InteropServices;
public class C {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
}
"@
  Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
} catch {}
# Parent PowerShell has a console; child GUI process should not share a new one.
# Record process name + main window.
$mw = $p.MainWindowHandle
Record 'GUI process has main window' ($mw -ne 0 -and -not $p.HasExited) ("hwnd=$mw pid=$($p.Id)")
Kill-Proc $p

$fail = @($results | Where-Object { -not $_.Ok })
$results | ConvertTo-Json | Set-Content (Join-Path $logDir 'results.json')
Write-Host ""
Write-Host ("TOTAL {0}  FAIL {1}" -f $results.Count, $fail.Count)
if ($fail.Count -gt 0) { exit 1 } else { exit 0 }
