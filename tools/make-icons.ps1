<#
    Genera los iconos de iPhone/PWA a partir del icono heredado de Android.

    Origen: Juego3d/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png (192x192)
    Destinos:
      web/icons/icon-<n>.png                                  (PWA / Safari)
      ios/RasmaticLugar3D/Assets.xcassets/AppIcon.appiconset/  (app nativa)

    El icono de Android es de 192 px, asi que las medidas mayores se
    interpolan (bicubica de alta calidad). No se redibuja: se conserva el
    mismo arte para que la app se vea igual en las dos plataformas.

    Uso: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = 'C:\Users\valen\OneDrive\Desktop\Juego3d\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png'
if (-not (Test-Path $src)) {
  throw "No se encontro el icono de origen: $src"
}

$webIcons = Join-Path $root 'web\icons'
$appIconSet = Join-Path $root 'ios\RasmaticLugar3D\Assets.xcassets\AppIcon.appiconset'
New-Item -ItemType Directory -Force -Path $webIcons | Out-Null
New-Item -ItemType Directory -Force -Path $appIconSet | Out-Null

$source = [System.Drawing.Image]::FromFile($src)
Write-Host ("Origen: {0} ({1}x{2}, {3} B)" -f $src, $source.Width, $source.Height, (Get-Item $src).Length)

function Resize-Icon {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [string]$Path,
    [switch]$NoAlpha
  )
  # La App Store rechaza el icono 1024 si tiene canal alfa: para el catalogo
  # de la app se guarda en 24 bpp (sin transparencia).
  $format = if ($NoAlpha) { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, $format)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($Image, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)))
  } finally {
    $g.Dispose()
  }
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  {0,-34} {1,4}x{1,-4} {2,8} B" -f (Split-Path -Leaf $Path), $Size, (Get-Item $Path).Length)
}

Write-Host ''
Write-Host 'PWA / Safari:'
foreach ($n in 180, 192, 512, 1024) {
  Resize-Icon -Image $source -Size $n -Path (Join-Path $webIcons ("icon-{0}.png" -f $n))
}

Write-Host ''
Write-Host 'App iOS (Assets.xcassets/AppIcon.appiconset):'
# Formato clasico de AppIcon (idiom iphone/ipad/ios-marketing): el que aceptan
# todas las versiones de Xcode. (punto, escala, idiom)
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

$images = @()
$entries = @()
foreach ($row in $iosSizes) {
  $point = $row[0]
  $scale = $row[1]
  $idiom = $row[2]
  $px = [int][Math]::Round($point * $scale)
  $pointLabel = $point.ToString([System.Globalization.CultureInfo]::InvariantCulture)
  $file = if ($idiom -eq 'ios-marketing') { 'icon-1024.png' } else { ('icon-{0}-{1}@{2}x.png' -f $idiom, $pointLabel, $scale) }
  Resize-Icon -Image $source -Size $px -Path (Join-Path $appIconSet $file) -NoAlpha
  $sizeLabel = if ($idiom -eq 'ios-marketing') { '1024x1024' } else { ('{0}x{0}' -f $pointLabel) }
  $images += [ordered]@{
    size = $sizeLabel
    idiom = $idiom
    filename = $file
    scale = ('{0}x' -f $scale)
  }
  $entries += ('    {{ "size": "{0}", "idiom": "{1}", "filename": "{2}", "scale": "{3}x" }}' -f $sizeLabel, $idiom, $file, $scale)
}

# JSON con formato estable (ConvertTo-Json de PS 5.1 lo deja ilegible).
$json = "{`n  `"images`": [`n" + ($entries -join ",`n") + "`n  ],`n" +
        "  `"info`": { `"author`": `"xcode`", `"version`": 1 }`n}`n"
[System.IO.File]::WriteAllText((Join-Path $appIconSet 'Contents.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ''
Write-Host ("Contents.json escrito ({0} imagenes)." -f $images.Count)

$source.Dispose()
Write-Host ''
Write-Host 'Listo.'
