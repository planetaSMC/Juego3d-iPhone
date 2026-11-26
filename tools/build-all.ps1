<#
    Reconstruye las dos variantes V19 en el orden correcto.

      1. make-icons.ps1  -> web/icons (HT), web/icons-classic (Classic)
                            y los Assets.xcassets de las dos apps
      2. build-ios.js    -> web/ + web-classic/, manifests, sw.js y espejos iOS
      3. check-parity.js -> el núcleo de las dos apps es idéntico
      4. check-xcode.js  -> targets, plists, permisos, iconos, esquemas y espejos

    El orden importa: build-ios.js espeja cada web/ a su app iOS, así que los
    iconos deben existir antes.

    Uso: powershell -ExecutionPolicy Bypass -File tools/build-all.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  Write-Host '== 1/4 iconos de las dos apps ==' -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'make-icons.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'make-icons.ps1 fallo' }

  Write-Host ''
  Write-Host '== 2/4 sitios + espejos iOS ==' -ForegroundColor Cyan
  & node (Join-Path $PSScriptRoot 'build-ios.js')
  if ($LASTEXITCODE -ne 0) { throw 'build-ios.js fallo' }

  Write-Host ''
  Write-Host '== 3/4 paridad del nucleo ==' -ForegroundColor Cyan
  & node (Join-Path $PSScriptRoot 'check-parity.js')
  if ($LASTEXITCODE -ne 0) { throw 'check-parity.js fallo' }

  Write-Host ''
  Write-Host '== 4/4 verificacion de los proyectos iOS ==' -ForegroundColor Cyan
  & node (Join-Path $PSScriptRoot 'check-xcode.js')
  if ($LASTEXITCODE -ne 0) { throw 'check-xcode.js fallo' }

  Write-Host ''
  Write-Host 'Las dos variantes V19 estan listas.' -ForegroundColor Green
} finally {
  Pop-Location
}
