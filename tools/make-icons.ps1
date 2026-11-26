<#
    Genera los iconos de las dos apps V19 a partir del icono heredado de Android.

    Origen: Juego3d/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png (192x192)

    Destinos:
      web/icons/                                              -> PWA Head Tracking
      web/icons-classic/                                      -> PWA Classic
      ios/RasmaticHeadTracking/Assets.xcassets/AppIcon...     -> app Head Tracking
      ios/RasmaticClassic/Assets.xcassets/AppIcon...          -> app Classic
      ios/RasmaticLugar3D/Assets.xcassets/AppIcon...          -> app heredada (sin banda)

    La identidad visual se distingue con una banda inferior:
      Head Tracking: azul, texto HT
      Classic:       ámbar, texto CL

    Uso: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = 'C:\Users\valen\OneDrive\Desktop\Juego3d\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png'
if (-not (Test-Path $src)) {
  throw "No se encontro el icono de origen: $src"
}

$source = [System.Drawing.Image]::FromFile($src)
Write-Host ("Origen: {0} ({1}x{2}, {3} B)" -f $src, $source.Width, $source.Height, (Get-Item $src).Length)

function Resize-Icon {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [string]$Path,
    [switch]$NoAlpha,
    [string]$Badge = '',
    [System.Drawing.Color]$BadgeColor = [System.Drawing.Color]::FromArgb(27, 95, 214)
  )
  $format = if ($NoAlpha) { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, $format)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $font = $null
  $brush = $null
  $fmt = $null
  try {
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($Image, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)))

    if ($Badge) {
      $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $bandH = [int][Math]::Max(3, $Size * 0.24)
      $rect = New-Object System.Drawing.RectangleF(0, ($Size - $bandH), $Size, $bandH)
      $brush = New-Object System.Drawing.SolidBrush($BadgeColor)
      $g.FillRectangle($brush, $rect)

      $fontSize = [single][Math]::Max(5, $Size * 0.17)
      $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $fmt = New-Object System.Drawing.StringFormat
      $fmt.Alignment = [System.Drawing.StringAlignment]::Center
      $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
      $g.DrawString($Badge, $font, [System.Drawing.Brushes]::White, $rect, $fmt)
    }
  } finally {
    if ($fmt) { $fmt.Dispose() }
    if ($font) { $font.Dispose() }
    if ($brush) { $brush.Dispose() }
    $g.Dispose()
  }
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0,-34} {1,4}x{1,-4} {2,8} B" -f (Split-Path -Leaf $Path), $Size, (Get-Item $Path).Length)
}

$iosSizes = @(
  @(20, 2, 'iphone'), @(20, 3, 'iphone'),
  @(29, 2, 'iphone'), @(29, 3, 'iphone'),
  @(40, 2, 'iphone'), @(40, 3, 'iphone'),
  @(60, 2, 'iphone'), @(60, 3, 'iphone'),
  @(20, 1, 'ipad'), @(20, 2, 'ipad'),
  @(29, 1, 'ipad'), @(29, 2, 'ipad'),
  @(40, 1, 'ipad'), @(40, 2, 'ipad'),
  @(76, 1, 'ipad'), @(76, 2, 'ipad'),
  @(83.5, 2, 'ipad'),
  @(1024, 1, 'ios-marketing')
)

function Write-AppIconSet {
  param(
    [System.Drawing.Image]$Image,
    [string]$WebDir,
    [string]$AssetDir,
    [string]$Badge = '',
    [System.Drawing.Color]$BadgeColor = [System.Drawing.Color]::FromArgb(27, 95, 214),
    [switch]$SkipWeb
  )
  New-Item -ItemType Directory -Force -Path $AssetDir | Out-Null

  if (-not $SkipWeb) {
    New-Item -ItemType Directory -Force -Path $WebDir | Out-Null
    Write-Host ''
    Write-Host ("PWA: {0}" -f $WebDir)
    foreach ($n in 180, 192, 512, 1024) {
      Resize-Icon -Image $Image -Size $n -Path (Join-Path $WebDir ("icon-{0}.png" -f $n)) `
        -Badge $Badge -BadgeColor $BadgeColor
    }
  }

  Write-Host ''
  Write-Host ("App iOS: {0}" -f $AssetDir)
  $entries = @()
  foreach ($row in $iosSizes) {
    $point = $row[0]
    $scale = $row[1]
    $idiom = $row[2]
    $px = [int][Math]::Round($point * $scale)
    $pointLabel = $point.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $file = if ($idiom -eq 'ios-marketing') { 'icon-1024.png' } else { ('icon-{0}-{1}@{2}x.png' -f $idiom, $pointLabel, $scale) }
    Resize-Icon -Image $Image -Size $px -Path (Join-Path $AssetDir $file) -NoAlpha `
      -Badge $Badge -BadgeColor $BadgeColor
    $sizeLabel = if ($idiom -eq 'ios-marketing') { '1024x1024' } else { ('{0}x{0}' -f $pointLabel) }
    $entries += ('    {{ "size": "{0}", "idiom": "{1}", "filename": "{2}", "scale": "{3}x" }}' -f $sizeLabel, $idiom, $file, $scale)
  }

  $json = "{`n  `"images`": [`n" + ($entries -join ",`n") + "`n  ],`n" +
          "  `"info`": { `"author`": `"xcode`", `"version`": 1 }`n}`n"
  [System.IO.File]::WriteAllText((Join-Path $AssetDir 'Contents.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("Contents.json escrito ({0} imagenes)." -f $entries.Count)
}

$cyan = [System.Drawing.Color]::FromArgb(27, 95, 214)
$amber = [System.Drawing.Color]::FromArgb(180, 83, 9)
$legacy = [System.Drawing.Color]::FromArgb(27, 95, 214)

# App Head Tracking
Write-AppIconSet -Image $source `
  -WebDir (Join-Path $root 'web\icons') `
  -AssetDir (Join-Path $root 'ios\RasmaticHeadTracking\Assets.xcassets\AppIcon.appiconset') `
  -Badge 'HT' -BadgeColor $cyan

# App Classic. Los iconos fuente viven fuera de web/ para no espejarse
# dentro de la app Head Tracking.
Write-AppIconSet -Image $source `
  -WebDir (Join-Path $root 'assets\icons-classic') `
  -AssetDir (Join-Path $root 'ios\RasmaticClassic\Assets.xcassets\AppIcon.appiconset') `
  -Badge 'CL' -BadgeColor $amber

# App heredada: se conserva tal cual estaba (sin banda), para no reemplazarla.
Write-AppIconSet -Image $source `
  -WebDir (Join-Path $root 'web\icons') `
  -AssetDir (Join-Path $root 'ios\RasmaticLugar3D\Assets.xcassets\AppIcon.appiconset') `
  -Badge '' -BadgeColor $legacy -SkipWeb

$source.Dispose()
Write-Host ''
Write-Host 'Listo.'
