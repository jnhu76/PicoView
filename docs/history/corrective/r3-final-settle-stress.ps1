# Live Windows final-settle stress for R3 producer-side presentation delivery.
# Waits for "window shown", binds the visible titled PicoView hwnd, rapid
# SetWindowPos resizes, settles at known client sizes, captures RUST_LOG.

$ErrorActionPreference = 'Stop'

$exe = "C:\Users\fred1\source\PicoView-wt-63\native\target\release\picoview.exe"
$image = "C:\img\001R0E0aly1i50ph1thhjj66dc48w1l102.jpg"
$log = "C:\Users\fred1\source\PicoView-wt-63\docs\history\corrective\smoke-r3-final-settle.log"
$out = "C:\Users\fred1\source\PicoView-wt-63\docs\history\corrective\smoke-r3-final-settle.out"
if (Test-Path $log) { Remove-Item $log -Force }
if (Test-Path $out) { Remove-Item $out -Force }

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Stress {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public const uint SWP_NOMOVE=0x2, SWP_NOZORDER=0x4, SWP_NOACTIVATE=0x10;
}
"@

$env:RUST_LOG = "info"
$proc = Start-Process -FilePath $exe -ArgumentList "`"$image`"" `
    -RedirectStandardOutput $out -RedirectStandardError $log -PassThru
Write-Host "started pid=$($proc.Id)"

$shown = $false
for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path $log) {
        $txt = Get-Content $log -Raw -ErrorAction SilentlyContinue
        if ($txt -and $txt -match "window shown") { $shown = $true; break }
    }
    $proc.Refresh()
    if ($proc.HasExited) { break }
}
if (-not $shown) {
    Write-Host "window never shown; exited=$($proc.HasExited)"
    if (Test-Path $log) { Get-Content $log | Select-Object -Last 40 }
    exit 1
}
Start-Sleep -Milliseconds 400

$targetPid = [uint32]$proc.Id
$script:foundHwnd = [IntPtr]::Zero
$cb = [Win32Stress+EnumWindowsProc]{
    param($hWnd, $lParam)
    $pidOut = [uint32]0
    [void][Win32Stress]::GetWindowThreadProcessId($hWnd, [ref]$pidOut)
    if ($pidOut -eq $targetPid) {
        $title = New-Object System.Text.StringBuilder 256
        [void][Win32Stress]::GetWindowTextW($hWnd, $title, 256)
        if ([Win32Stress]::IsWindowVisible($hWnd) -and $title.ToString() -eq "PicoView") {
            $script:foundHwnd = $hWnd
            return $false
        }
    }
    return $true
}
[void][Win32Stress]::EnumWindows($cb, [IntPtr]::Zero)
$hwnd = $script:foundHwnd
if ($hwnd -eq [IntPtr]::Zero) {
    $proc.Refresh()
    $hwnd = $proc.MainWindowHandle
    Write-Host "fallback MainWindowHandle=$hwnd"
} else {
    Write-Host "bound PicoView hwnd=$hwnd"
}

function Get-Client {
    param([IntPtr]$h)
    $wr = New-Object Win32Stress+RECT
    $cr = New-Object Win32Stress+RECT
    [void][Win32Stress]::GetWindowRect($h, [ref]$wr)
    [void][Win32Stress]::GetClientRect($h, [ref]$cr)
    @{
        dx = ($wr.Right-$wr.Left)-($cr.Right-$cr.Left)
        dy = ($wr.Bottom-$wr.Top)-($cr.Bottom-$cr.Top)
        cw = $cr.Right-$cr.Left
        ch = $cr.Bottom-$cr.Top
    }
}

function Set-Client {
    param([IntPtr]$h, [int]$w, [int]$ht)
    $d = Get-Client $h
    $flags = [Win32Stress]::SWP_NOMOVE -bor [Win32Stress]::SWP_NOZORDER -bor [Win32Stress]::SWP_NOACTIVATE
    [void][Win32Stress]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, ($w+$d.dx), ($ht+$d.dy), $flags)
}

function Rapid-Then-Settle {
    param([IntPtr]$Wnd, [int]$ClientW, [int]$ClientH, [string]$Label)
    Write-Host "STRESS $Label -> client ${ClientW}x${ClientH}"
    $ws = @(900, 1100, 700, 1300, 500, 1000, 800, 1400, 650, 1150, $ClientW)
    $hs = @(600, 750, 450, 850, 350, 700, 500, 900, 420, 780, $ClientH)
    $n = [Math]::Min($ws.Length, $hs.Length)
    for ($i = 0; $i -lt $n; $i++) {
        Set-Client $Wnd $ws[$i] $hs[$i]
        Start-Sleep -Milliseconds 8
    }
    Set-Client $Wnd $ClientW $ClientH
    Start-Sleep -Milliseconds 1000
    $d = Get-Client $Wnd
    Write-Host "  client after settle: $($d.cw)x$($d.ch) (want ${ClientW}x${ClientH})"
}

Rapid-Then-Settle $hwnd 1200 800 "settle-1200x800"
Rapid-Then-Settle $hwnd 600  400 "settle-600x400"
Rapid-Then-Settle $hwnd 1200 800 "settle-1200x800-repeat"
Rapid-Then-Settle $hwnd 600  400 "settle-600x400-repeat"

Write-Host "STRESS hard-burst then final 1200x800"
for ($i = 0; $i -lt 40; $i++) {
    $w = 400 + (($i * 37) % 1000)
    $ht = 280 + (($i * 23) % 700)
    Set-Client $hwnd $w $ht
}
Set-Client $hwnd 1200 800
Start-Sleep -Milliseconds 1500
$d = Get-Client $hwnd
Write-Host "  final client: $($d.cw)x$($d.ch)"

Write-Host "===== MARKERS (pre-close) ====="
Select-String -Path $log -Pattern "R1 presentation update|R1 present|R3 pending|R3 presentation|R3 non-presentation|Resized " |
    ForEach-Object { $_.Line }

Write-Host "closing pid=$($proc.Id)"
[void]$proc.CloseMainWindow()
if (-not $proc.WaitForExit(8000)) {
    Write-Host "force kill"
    Stop-Process -Id $proc.Id -Force
    $proc.WaitForExit(3000)
}
Start-Sleep -Milliseconds 400

Write-Host "===== FINAL MARKERS ====="
if (Test-Path $log) {
    Select-String -Path $log -Pattern "R1 presentation update|R1 present|R3 pending|R3 presentation|R3 non-presentation|Resized " |
        ForEach-Object { $_.Line }
    Write-Host "log_bytes=$((Get-Item $log).Length)"
}
