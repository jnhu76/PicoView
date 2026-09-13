$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DisplayCycle {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DEVMODE {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion; public short dmDriverVersion;
        public short dmSize; public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX; public int dmPositionY;
        public int dmDisplayOrientation; public int dmDisplayFixedOutput;
        public short dmColor; public short dmDuplex;
        public short dmYResolution; public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public short dmLogPixels; public int dmBitsPerPel;
        public int dmPelsWidth; public int dmPelsHeight;
        public int dmDisplayFlags; public int dmDisplayFrequency;
        public int dmICMMethod; public int dmICMIntent;
        public int dmMediaType; public int dmDitherType;
        public int dmReserved1; public int dmReserved2;
        public int dmPanningWidth; public int dmPanningHeight;
    }
    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    public static extern int EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);
    [DllImport("user32.dll", CharSet = CharSet.Ansi)]
    public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);
}
"@
$dev = New-Object DisplayCycle+DEVMODE
$dev.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][DisplayCycle+DEVMODE])
[DisplayCycle]::EnumDisplaySettings($null, -1, [ref]$dev) | Out-Null
$origW = $dev.dmPelsWidth; $origH = $dev.dmPelsHeight; $origHz = $dev.dmDisplayFrequency
Write-Output "current: ${origW}x${origH}@$origHz"

# find an intermediate mode
$alt = $null
for ($i = 0; $i -lt 40 -and -not $alt; $i++) {
    $m = New-Object DisplayCycle+DEVMODE
    $m.dmSize = $dev.dmSize
    if ([DisplayCycle]::EnumDisplaySettings($null, $i, [ref]$m) -eq 0) { break }
    if ($m.dmPelsWidth -lt $origW -and $m.dmBitsPerPel -eq 32 -and $m.dmDisplayFrequency -eq $origHz) { $alt = $m }
}
if (-not $alt) { Write-Output "no alternate mode found"; exit 1 }
Write-Output "switching to $($alt.dmPelsWidth)x$($alt.dmPelsHeight)"
[DisplayCycle]::ChangeDisplaySettings([ref]$alt, 0) | Out-Null
Start-Sleep -Seconds 3
$back = New-Object DisplayCycle+DEVMODE
$back.dmSize = $dev.dmSize
[DisplayCycle]::EnumDisplaySettings($null, -1, [ref]$back) | Out-Null
$back.dmPelsWidth = $origW; $back.dmPelsHeight = $origH; $back.dmDisplayFrequency = $origHz; $back.dmFields = 0x180008
Write-Output "restoring ${origW}x${origH}@$origHz"
$r = [DisplayCycle]::ChangeDisplaySettings([ref]$back, 0)
Write-Output "restore result: $r"
