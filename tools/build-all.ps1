<#
    Reconstruye RASMATIC VR (V20) en el orden correcto.

      1. make-icons.ps1 -> iconos PWA + Assets.xcassets de la app única
      2. build-ios.js   -> manifest, sw.js y espejo ios/RasmaticLugar3D/www
      3. check-xcode.js -> target único, plist, permisos, escena V20 y espejo

    Uso: powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  Write-Host '== 1/3 iconos ==' -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'make-icons.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'make-icons.ps1 fallo' }

  Write-Host ''
  Write-Host '== 2/3 sitio + espejo iOS ==' -ForegroundColor Cyan
  & node (Join-Path $PSScriptRoot 'build-ios.js')
  if ($LASTEXITCODE -ne 0) { throw 'build-ios.js fallo' }

  Write-Host ''
  Write-Host '== 3/3 verificacion ==' -ForegroundColor Cyan
  & node (Join-Path $PSScriptRoot 'check-xcode.js')
  if ($LASTEXITCODE -ne 0) { throw 'check-xcode.js fallo' }

  Write-Host ''
  Write-Host 'RASMATIC VR lista.' -ForegroundColor Green
} finally {
  Pop-Location
}
