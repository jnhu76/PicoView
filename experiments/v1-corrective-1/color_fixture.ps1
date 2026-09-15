# PICOVIEW-PR49-COLOR-CANONICAL-1: deterministic asymmetric color fixture.
# 256x128 JPEG, six high-saturation regions laid out so any R/B channel swap
# in the present path is immediately visible:
#
#   RED   | BLUE
#   GREEN | MAGENTA
#   YELLOW| CYAN
#
# Regenerate: powershell -ExecutionPolicy Bypass -File color_fixture.ps1

Add-Type -AssemblyName System.Drawing
$w = 256; $h = 128
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$colors = @(
    @([System.Drawing.Color]::Red,     [System.Drawing.Color]::Blue),
    @([System.Drawing.Color]::Green,   [System.Drawing.Color]::Magenta),
    @([System.Drawing.Color]::Yellow,  [System.Drawing.Color]::Cyan)
)

$rowH = [int][math]::Floor($h / 3)
$colW = [int][math]::Floor($w / 2)
for ($row = 0; $row -lt 3; $row++) {
    for ($col = 0; $col -lt 2; $col++) {
        $x = $col * $colW
        $y = $row * $rowH
        $cw = $(if ($col -eq 1) { $w - $x } else { $colW })
        $ch = $(if ($row -eq 2) { $h - $y } else { $rowH })
        $brush = New-Object System.Drawing.SolidBrush($colors[$row][$col])
        $g.FillRectangle($brush, $x, $y, $cw, $ch)
        $brush.Dispose()
    }
}
$g.Dispose()

$out = Join-Path $PSScriptRoot "..\..\test-media\color-fixture.jpg"
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]95)
$bmp.Save($out, $codec, $ep)
$bmp.Dispose()
Write-Output "written: $out"
